// #221 research probe: a bare WKWebView, set up the way react-native-webview loads a cached canvas.
// Launch args: -mode file|http, -url <url>, -root <dir> (file mode: allowingReadAccessTo), -out <result.json>,
// -js <script> (run 4 s after load, before measuring)
import UIKit
import WebKit

final class Controller: UIViewController, WKNavigationDelegate {
  let web = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
  var out = ""
  var script = ""

  override func viewDidLoad() {
    super.viewDidLoad()
    web.navigationDelegate = self
    web.frame = view.bounds
    web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(web)
    let args = ProcessInfo.processInfo.arguments
    func arg(_ name: String) -> String? {
      guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
      return args[i + 1]
    }
    out = arg("-out") ?? ""
    script = arg("-js") ?? ""
    guard let raw = arg("-url"), let url = URL(string: raw) else { return }
    if arg("-mode") == "file", let root = arg("-root"), !root.isEmpty {
      web.loadFileURL(url, allowingReadAccessTo: URL(fileURLWithPath: root, isDirectory: true))
    } else {
      web.load(URLRequest(url: url))
    }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
      if self.script.isEmpty { self.measure(); return }
      self.web.evaluateJavaScript(self.script) { _, _ in
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.measure() }
      }
    }
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    write("{\"error\":\"\(error.localizedDescription)\"}")
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    write("{\"error\":\"\(error.localizedDescription)\"}")
  }

  func measure() {
    let js = """
    JSON.stringify({
      ua: navigator.userAgent, vw: innerWidth, docScrollWidth: document.documentElement.scrollWidth,
      stageZoom: document.getElementById('stage') ? getComputedStyle(document.getElementById('stage')).zoom : null,
      frames: [...document.querySelectorAll('iframe')].slice(0, 6).map((f) => {
        let inner = null, text = null;
        try { inner = f.contentWindow.innerWidth; text = f.contentDocument.body.innerText.trim().length; } catch (e) { inner = 'blocked'; }
        return { cssWidth: f.getAttribute('width') || f.style.width, rectWidth: Math.round(f.getBoundingClientRect().width), inner: inner, text: text };
      }),
    })
    """
    web.evaluateJavaScript(js) { value, error in
      self.write((value as? String) ?? "{\"error\":\"\(error?.localizedDescription ?? "nil")\"}")
    }
  }

  func write(_ json: String) {
    guard !out.isEmpty else { return }
    try? json.write(toFile: out, atomically: true, encoding: .utf8)
  }
}

final class Delegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    window = UIWindow(frame: UIScreen.main.bounds)
    window?.rootViewController = Controller()
    window?.makeKeyAndVisible()
    return true
  }
}

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(Delegate.self))
