import { parse } from 'acorn';
import type { ArrowFunctionExpression, Node, Pattern, Program } from 'estree';

type Value = string | number | boolean | null | undefined | Value[] | Data | Formula;
interface Data { [key: string]: Value }
class Formula {
  constructor(readonly node: ArrowFunctionExpression, readonly scope: Map<string, Value>) {}
}
const record = (value: Value): value is Data => value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Formula);
const scalar = (value: Value): value is string | number | boolean | null => value !== undefined && (value === null || typeof value !== 'object');

/** A bounded reader for canvas data expressions. Never invokes repository code or host functions. */
export function canvasData(source: string): Data | null {
  if (source.length > 1_000_000) return null;
  let steps = 0;
  const root = new Map<string, Value>();
  const windowData: Data = Object.create(null) as Data;
  root.set('window', windowData);
  function assertNoWrites(value: unknown, depth = 0): void {
    if (++steps > 100_000 || depth > 80) throw new Error('Canvas data limit exceeded');
    if (value === null || typeof value !== 'object') return;
    const node = value as { type?: string; operator?: string };
    if (node.type === 'AssignmentExpression' || node.type === 'UpdateExpression' ||
      (node.type === 'UnaryExpression' && node.operator === 'delete')) throw new Error('Unsupported canvas write');
    for (const child of Object.values(value)) assertNoWrites(child, depth + 1);
  }
  function bind(pattern: Pattern, value: Value, scope: Map<string, Value>): void {
    if (pattern.type === 'Identifier') scope.set(pattern.name, value);
    else if (pattern.type === 'AssignmentPattern') bind(pattern.left, value === undefined ? read(pattern.right, scope) : value, scope);
    else if (pattern.type === 'ArrayPattern' && Array.isArray(value))
      pattern.elements.forEach((element, index) => { if (element) bind(element, value[index], scope); });
  }
  function call(formula: Value, args: Value[], depth: number): Value {
    if (!(formula instanceof Formula)) throw new Error('Unsupported canvas call');
    const scope = new Map(formula.scope);
    formula.node.params.forEach((param, index) => bind(param, args[index], scope));
    if (formula.node.body.type === 'BlockStatement') throw new Error('Unsupported canvas function body');
    return read(formula.node.body, scope, depth + 1);
  }
  function read(node: Node, scope: Map<string, Value>, depth = 0): Value {
    if (++steps > 100_000 || depth > 80) throw new Error('Canvas data limit exceeded');
    const value = expression(node, scope, depth);
    if ((typeof value === 'string' && value.length > 1_000_000) || (Array.isArray(value) && value.length > 10_000))
      throw new Error('Canvas data size exceeded');
    // A missing page, section or item could contain a later choice. Never return a partial array.
    if (Array.isArray(value) && value.some((entry) => entry === undefined)) throw new Error('Unresolved canvas entry');
    return value;
  }
  function expression(node: Node, scope: Map<string, Value>, depth: number): Value {
    const next = (child: Node): Value => read(child, scope, depth + 1);
    switch (node.type) {
      case 'Literal': return scalar(node.value as Value) ? node.value as Value : undefined;
      case 'Identifier': {
        if (!scope.has(node.name)) throw new Error('Unresolved canvas identifier');
        return scope.get(node.name);
      }
      case 'ArrowFunctionExpression': return new Formula(node, scope);
      case 'ObjectExpression': {
        const result: Data = Object.create(null) as Data;
        for (const prop of node.properties) {
          if (prop.type === 'SpreadElement') {
            const value = next(prop.argument);
            if (!record(value)) return undefined;
            Object.assign(result, value);
          } else {
            const key = prop.computed ? next(prop.key) : prop.key.type === 'Identifier' ? prop.key.name : next(prop.key);
            if (typeof key !== 'string' && typeof key !== 'number') throw new Error('Unresolved canvas property');
            result[key] = next(prop.value);
          }
        }
        return result;
      }
      case 'ArrayExpression': {
        const result: Value[] = [];
        for (const element of node.elements) {
          if (!element) { result.push(undefined); continue; }
          if (element.type !== 'SpreadElement') result.push(next(element));
          else {
            const value = next(element.argument);
            if (!Array.isArray(value)) return undefined;
            result.push(...value);
          }
        }
        return result;
      }
      case 'MemberExpression': {
        const value = next(node.object);
        const key = node.computed ? next(node.property) : node.property.type === 'Identifier' ? node.property.name : undefined;
        if ((typeof key === 'string' || typeof key === 'number') && record(value)) return value[key];
        if ((Array.isArray(value) || typeof value === 'string') && typeof key === 'number') return value[key];
        return undefined;
      }
      case 'TemplateLiteral': {
        let result = node.quasis[0]?.value.cooked ?? '';
        for (let index = 0; index < node.expressions.length; index++) {
          const value = next(node.expressions[index]!);
          if (!scalar(value)) return undefined;
          result += String(value) + (node.quasis[index + 1]?.value.cooked ?? '');
        }
        return result;
      }
      case 'BinaryExpression': {
        const left = next(node.left), right = next(node.right);
        if (left === undefined || right === undefined) return undefined;
        if (node.operator === '===') return left === right;
        if (node.operator === '!==') return left !== right;
        if (node.operator === '+' && scalar(left) && scalar(right))
          return typeof left === 'string' || typeof right === 'string' ? String(left) + String(right) : Number(left) + Number(right);
        if (typeof left === 'number' && typeof right === 'number') {
          if (node.operator === '<') return left < right;
          if (node.operator === '<=') return left <= right;
          if (node.operator === '>') return left > right;
          if (node.operator === '>=') return left >= right;
        }
        throw new Error('Unsupported canvas operator');
      }
      case 'ConditionalExpression': {
        const condition = next(node.test);
        if (condition === undefined) throw new Error('Unresolved canvas condition');
        return next(condition ? node.consequent : node.alternate);
      }
      case 'CallExpression': {
        const args = node.arguments.map((arg) => {
          if (arg.type === 'SpreadElement') throw new Error('Unsupported canvas call spread');
          return next(arg);
        });
        if (node.callee.type === 'MemberExpression') {
          const value = next(node.callee.object);
          const key = node.callee.computed ? next(node.callee.property) : node.callee.property.type === 'Identifier' ? node.callee.property.name : undefined;
          if (Array.isArray(value) && key === 'map') return value.map((item, index) => call(args[0], [item, index], depth + 1));
          if (Array.isArray(value) && key === 'join' && value.every(scalar) &&
            (args[0] === undefined || typeof args[0] === 'string')) {
            const separator = args[0] ?? ',';
            const parts = value.map((item) => item === null ? '' : String(item));
            if (parts.reduce((size, item) => size + item.length + separator.length, 0) > 1_000_000)
              throw new Error('Canvas data size exceeded');
            return parts.join(separator);
          }
          if (typeof value === 'string') {
            if (key === 'toLowerCase' && args.length === 0) return value.toLowerCase();
            if (key === 'startsWith' && typeof args[0] === 'string') return value.startsWith(args[0]);
            // Only the canvas slug expression is supported; never run an untrusted regular expression.
            const pattern = node.arguments[0];
            if (key === 'replace' && pattern?.type === 'Literal' && 'regex' in pattern &&
              pattern.regex.pattern === '[^a-z]+' && pattern.regex.flags === 'g' && args[1] === '-') return value.replace(/[^a-z]+/g, '-');
          }
        }
        return call(next(node.callee), args, depth + 1);
      }
      default: throw new Error('Unsupported canvas expression');
    }
  }
  try {
    const program = parse(source, { ecmaVersion: 'latest', sourceType: 'script' }) as unknown as Program;
    for (const statement of program.body) {
      if (statement.type === 'ThrowStatement') break;
      if (statement.type === 'VariableDeclaration' && statement.kind === 'const') {
        for (const declaration of statement.declarations) if (declaration.init) {
          assertNoWrites(declaration.id);
          assertNoWrites(declaration.init);
          bind(declaration.id, read(declaration.init, root), root);
        }
      } else if (statement.type === 'ExpressionStatement') {
        const expr = statement.expression;
        if (expr.type === 'AssignmentExpression' && expr.operator === '=' && expr.left.type === 'MemberExpression' &&
          expr.left.object.type === 'Identifier' && expr.left.object.name === 'window' && !expr.left.computed &&
          expr.left.property.type === 'Identifier' && expr.left.property.name === 'CANVAS') {
          assertNoWrites(expr.right);
          windowData.CANVAS = read(expr.right, root);
        } else if (expr.type === 'CallExpression' && expr.callee.type === 'MemberExpression' && !expr.callee.computed &&
          expr.callee.property.type === 'Identifier' && expr.callee.property.name === 'push' &&
          expr.callee.object.type === 'MemberExpression' && !expr.callee.object.computed &&
          expr.callee.object.property.type === 'Identifier' && expr.callee.object.property.name === 'pages' &&
          expr.callee.object.object.type === 'MemberExpression' && !expr.callee.object.object.computed &&
          expr.callee.object.object.object.type === 'Identifier' && expr.callee.object.object.object.name === 'window' &&
          expr.callee.object.object.property.type === 'Identifier' && expr.callee.object.object.property.name === 'CANVAS') {
          const pages = read(expr.callee.object, root);
          if (!Array.isArray(pages)) return null;
          for (const arg of expr.arguments) {
            assertNoWrites(arg);
            const value = read(arg.type === 'SpreadElement' ? arg.argument : arg, root);
            if (arg.type === 'SpreadElement') {
              if (!Array.isArray(value)) return null;
              pages.push(...value);
            } else {
              if (!record(value)) return null;
              pages.push(value);
            }
          }
        } else if (expr.type !== 'Literal') {
          // An unmodelled write or call could supersede an earlier Keep. Withhold the catalog.
          return null;
        }
      } else if (statement.type !== 'EmptyStatement') {
        return null;
      }
    }
    return record(windowData.CANVAS) ? windowData.CANVAS : null;
  } catch {
    return null;
  }
}
