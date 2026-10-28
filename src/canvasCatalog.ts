import { parse } from 'acorn';
import type { ArrayExpression, Expression, ObjectExpression, Property } from 'estree';

export interface CanvasCatalogItem {
  id: string;
  name: string;
  src: string | null;
  disposition: string | null;
  feedback: string | null;
  basedOn: string[];
  width?: number;
  height?: number;
}

export interface CanvasCatalogPage {
  id: string;
  title: string;
  round: number | string | null;
  items: CanvasCatalogItem[];
}

function property(object: ObjectExpression, key: string): Expression | null {
  const found = object.properties.find((entry): entry is Property => entry.type === 'Property' && !entry.computed &&
    ((entry.key.type === 'Identifier' && entry.key.name === key) || (entry.key.type === 'Literal' && entry.key.value === key)));
  return found ? found.value as Expression : null;
}

function literal(node: Expression | null): string | number | null {
  if (node?.type === 'Literal' && (typeof node.value === 'string' || typeof node.value === 'number')) return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? null;
  return null;
}
function string(node: Expression | null): string | null {
  const value = literal(node);
  return typeof value === 'string' ? value : null;
}
function array(node: Expression | null): Expression[] {
  return node?.type === 'ArrayExpression' ? (node as ArrayExpression).elements.filter((item): item is Expression => item !== null && item.type !== 'SpreadElement') : [];
}
function object(node: Expression | null): ObjectExpression | null {
  return node?.type === 'ObjectExpression' ? node : null;
}

/** Read literal canvas metadata without executing repository-supplied JavaScript. */
export function canvasCatalog(source: string): CanvasCatalogPage[] {
  try {
    const program = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
    const assignment = program.body.find((statement) => statement.type === 'ExpressionStatement' &&
      statement.expression.type === 'AssignmentExpression' && statement.expression.left.type === 'MemberExpression' &&
      statement.expression.left.object.type === 'Identifier' && statement.expression.left.object.name === 'window' &&
      statement.expression.left.property.type === 'Identifier' && statement.expression.left.property.name === 'CANVAS');
    if (assignment?.type !== 'ExpressionStatement' || assignment.expression.type !== 'AssignmentExpression') return [];
    const config = object(assignment.expression.right as unknown as Expression);
    if (!config) return [];
    const constants = new Map<string, ObjectExpression>();
    for (const statement of program.body) {
      if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') continue;
      for (const declaration of statement.declarations) {
        if (declaration.id.type === 'Identifier' && declaration.init?.type === 'ObjectExpression')
          constants.set(declaration.id.name, declaration.init as unknown as ObjectExpression);
      }
    }
    return array(property(config, 'pages')).flatMap((value, index) => {
      const page = object(value);
      if (!page) return [];
      const title = string(property(page, 'title')) ?? string(property(page, 'name')) ?? `Page ${index + 1}`;
      const id = string(property(page, 'id')) ?? (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page');
      const sections = array(property(page, 'sections')).flatMap((entry) => {
        const section = object(entry);
        return section ? array(property(section, 'items')) : [];
      });
      const items = [...array(property(page, 'items')), ...sections].flatMap((entry) => {
        const item = object(entry);
        if (!item) return [];
        const itemId = string(property(item, 'id'));
        if (!itemId || string(property(item, 'kind')) === 'note') return [];
        const note = object(property(item, 'note'));
        const spread = item.properties.find((entry) => entry.type === 'SpreadElement' && entry.argument.type === 'Identifier');
        const defaults = spread?.type === 'SpreadElement' && spread.argument.type === 'Identifier' ? constants.get(spread.argument.name) : undefined;
        const width = literal(property(item, 'width')) ?? (defaults ? literal(property(defaults, 'width')) : null);
        const height = literal(property(item, 'height')) ?? (defaults ? literal(property(defaults, 'height')) : null);
        const based = note ? property(note, 'basedOn') : null;
        const sources = string(based);
        return [{ id: itemId, name: string(property(item, 'name')) ?? itemId, src: string(property(item, 'src')),
          disposition: note ? string(property(note, 'disposition')) : null,
          feedback: note ? string(property(note, 'feedback')) : null,
          ...(typeof width === 'number' && width > 0 ? { width } : {}),
          ...(typeof height === 'number' && height > 0 ? { height } : {}),
          basedOn: sources ? [sources] : array(based).map(string).filter((x): x is string => x !== null) }];
      });
      return [{ id, title, round: literal(property(page, 'round')), items }];
    });
  } catch {
    return [];
  }
}
