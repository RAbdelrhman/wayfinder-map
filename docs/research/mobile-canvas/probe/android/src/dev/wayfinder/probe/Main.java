package dev.wayfinder.probe;

import android.app.Activity;
import android.os.Bundle;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** A full-screen System WebView, set up the way react-native-webview would load a cached canvas. */
public class Main extends Activity {
  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    WebView.setWebContentsDebuggingEnabled(true);
    WebView view = new WebView(this);
    WebSettings s = view.getSettings();
    s.setJavaScriptEnabled(true);
    s.setAllowFileAccess(true);
    s.setBuiltInZoomControls(true);
    s.setDisplayZoomControls(false);
    s.setUseWideViewPort(getIntent().getBooleanExtra("wide", true));
    view.setWebViewClient(new WebViewClient());
    view.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onConsoleMessage(ConsoleMessage m) {
        Log.i("CanvasProbe", m.messageLevel() + " " + m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
        return true;
      }
    });
    setContentView(view);
    String url = getIntent().getStringExtra("url");
    view.loadUrl(url != null ? url : "about:blank");
  }
}
