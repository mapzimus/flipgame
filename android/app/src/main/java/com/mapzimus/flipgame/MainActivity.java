package com.mapzimus.flipgame;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

// Full-screen WebView that loads the bundled game from the APK's assets.
// The game remains fully offline-capable. When Online beta is explicitly
// enabled it may use the INTERNET permission declared in the manifest.
public class MainActivity extends Activity {
    private static final String ASSET_ORIGIN = "file:///android_asset/";
    private static final String PLATFORM_BRIDGE = "FlipgamePlatform";
    private static final String FILE_BRIDGE = "FlipgameFileBridge";
    private static final int FILE_CHOOSER_REQUEST = 1701;
    private static final int EXPORT_CREATE_REQUEST = 1702;
    private static final int EXPORT_CHUNK_BYTES = 48 * 1024;
    private static final int MAX_EXPORT_CHUNK_BASE64 = 96 * 1024;
    private static final long MAX_EXPORT_BYTES = 256L * 1024L * 1024L;
    private static final Pattern SAFE_TOKEN = Pattern.compile("[A-Za-z0-9_-]{1,80}");
    private static final Pattern SAFE_MIME = Pattern.compile(
        "[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+*+-]+");

    private final Object exportLock = new Object();
    private final Map<String, ExportTransfer> exportTransfers = new HashMap<>();
    private final ArrayDeque<PendingExport> exportQueue = new ArrayDeque<>();

    private WebView web;
    private ValueCallback<Uri[]> fileChooserCallback;
    private PendingExport activeExport;
    private volatile boolean destroyed;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        purgeStaleExportCache();

        web = new WebView(this);
        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setUseWideViewPort(true);
        ws.setLoadWithOverviewMode(true);
        ws.setMediaPlaybackRequiresUserGesture(false);
        ws.setAllowContentAccess(true);
        ws.setAllowFileAccessFromFileURLs(false);
        ws.setAllowUniversalAccessFromFileURLs(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                return request.isForMainFrame() && !url.startsWith(ASSET_ORIGIN);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && url.startsWith(ASSET_ORIGIN)) installBlobCapture(view);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                WebView view,
                ValueCallback<Uri[]> callback,
                FileChooserParams params
            ) {
                return openDocumentPicker(callback, params);
            }
        });
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            stageWebDownload(url, contentDisposition, mimeType));

        // The bundled page is trusted local content. Its v111 platform module
        // keeps the display awake only while a match is active. The file bridge
        // accepts bounded export chunks only; it never receives arbitrary paths.
        web.addJavascriptInterface(new PlatformBridge(), "FlipgamePlatform");
        web.addJavascriptInterface(new FileBridge(), FILE_BRIDGE);

        setContentView(web);
        web.loadUrl(ASSET_ORIGIN + "index.html");
        hideSystemBars();
    }

    private void purgeStaleExportCache() {
        File directory = new File(getCacheDir(), "exports");
        File[] staleFiles = directory.listFiles();
        if (staleFiles == null) return;
        for (File staleFile : staleFiles) {
            if (staleFile.isFile() && staleFile.getName().startsWith("flipgame-")
                && staleFile.getName().endsWith(".part")) {
                staleFile.delete();
            }
        }
    }

    private boolean openDocumentPicker(
        ValueCallback<Uri[]> callback,
        WebChromeClient.FileChooserParams params
    ) {
        if (callback == null || destroyed) return false;
        cancelFileChooser();
        fileChooserCallback = callback;

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);

        String[] mimeTypes = acceptedMimeTypes(params == null ? null : params.getAcceptTypes());
        intent.setType(mimeTypes.length == 1 ? mimeTypes[0] : "*/*");
        if (mimeTypes.length > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
        intent.putExtra(
            Intent.EXTRA_ALLOW_MULTIPLE,
            params != null && params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);

        try {
            startActivityForResult(intent, FILE_CHOOSER_REQUEST);
            return true;
        } catch (RuntimeException error) {
            fileChooserCallback = null;
            callback.onReceiveValue(null);
            showToast("No document picker is available.");
            return true;
        }
    }

    private String[] acceptedMimeTypes(String[] accepted) {
        Set<String> mimeTypes = new LinkedHashSet<>();
        if (accepted != null) {
            for (String group : accepted) {
                if (group == null) continue;
                for (String candidate : group.split(",")) {
                    String normalized = candidate.trim().toLowerCase(Locale.ROOT);
                    if (normalized.isEmpty()) continue;
                    if (SAFE_MIME.matcher(normalized).matches()) {
                        mimeTypes.add(normalized);
                        continue;
                    }
                    String mapped = mimeForExtension(normalized);
                    if (mapped != null) mimeTypes.add(mapped);
                }
            }
        }
        return mimeTypes.toArray(new String[0]);
    }

    private String mimeForExtension(String extension) {
        if (extension.endsWith(".flipstats.json") || extension.endsWith(".json")) {
            return "application/json";
        }
        // Android document providers generally report the custom backup
        // extension as binary even though its checked payload is structured.
        if (extension.endsWith(".flipgame-save")) return "application/octet-stream";
        if (extension.endsWith(".csv")) return "text/csv";
        if (extension.endsWith(".txt")) return "text/plain";
        String clean = extension.startsWith(".") ? extension.substring(1) : extension;
        if (clean.indexOf('/') >= 0 || clean.indexOf('\\') >= 0) return null;
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(clean);
    }

    private void cancelFileChooser() {
        ValueCallback<Uri[]> callback = fileChooserCallback;
        fileChooserCallback = null;
        if (callback != null) callback.onReceiveValue(null);
    }

    private void installBlobCapture(WebView view) {
        String script = "(function(){if(window.__flipgameNativeBlobs)return;"
            + "var blobs=new Map(),names=new Map(),make=URL.createObjectURL.bind(URL),"
            + "revoke=URL.revokeObjectURL.bind(URL);"
            + "Object.defineProperty(window,'__flipgameNativeBlobs',{value:blobs});"
            + "Object.defineProperty(window,'__flipgameNativeDownloadNames',{value:names});"
            + "URL.createObjectURL=function(value){var url=make(value);"
            + "if(typeof Blob!=='undefined'&&value instanceof Blob)blobs.set(url,value);return url;};"
            + "URL.revokeObjectURL=function(url){revoke(url);setTimeout(function(){blobs.delete(url);"
            + "names.delete(url);},60000);};"
            + "document.addEventListener('click',function(event){var item=event.target;"
            + "while(item&&item.tagName!=='A')item=item.parentElement;"
            + "if(item&&item.download&&item.href)names.set(item.href,item.download);},true);"
            + "})()";
        view.evaluateJavascript(script, null);
    }

    private void stageWebDownload(String url, String contentDisposition, String mimeType) {
        if (destroyed || web == null || url == null || url.isEmpty()) return;
        String token = UUID.randomUUID().toString();
        String safeMime = sanitizeMimeType(mimeType);
        String suggestedName = sanitizeFileName(
            URLUtil.guessFileName(url, contentDisposition, safeMime), safeMime);

        // WebView cannot hand a blob: URL directly to Android. Fetch it in the
        // page, encode one small slice at a time, and synchronously pass each
        // bounded chunk to the trusted bridge. The Java side writes each chunk
        // immediately, so large stats archives do not accumulate in Java memory.
        String script = "(async function(){"
            + "var b=window." + FILE_BRIDGE + ";if(!b)return;"
            + "var t=" + JSONObject.quote(token) + ";"
            + "try{"
            + "var u=" + JSONObject.quote(url) + ";"
            + "var z=window.__flipgameNativeBlobs;var v=z&&z.get(u);if(v)z.delete(u);"
            + "if(!v){var r=await fetch(u);"
            + "if(!r.ok&&r.status!==0)throw new Error('download fetch failed');v=await r.blob();}"
            + "var n=" + JSONObject.quote(suggestedName) + ";"
            + "var names=window.__flipgameNativeDownloadNames;"
            + "if(names&&names.get(u)){n=names.get(u);names.delete(u);}"
            + "var m=v.type||" + JSONObject.quote(safeMime) + ";"
            + "if(!b.beginDownload(t,n,m,v.size))throw new Error('download rejected');"
            + "for(var o=0;o<v.size;o+=" + EXPORT_CHUNK_BYTES + "){"
            + "var s=v.slice(o,Math.min(o+" + EXPORT_CHUNK_BYTES + ",v.size));"
            + "var q=await new Promise(function(ok,no){var f=new FileReader();"
            + "f.onload=function(){var x=String(f.result||'');ok(x.slice(x.indexOf(',')+1));};"
            + "f.onerror=function(){no(f.error||new Error('read failed'));};f.readAsDataURL(s);});"
            + "if(!b.appendDownload(t,q))throw new Error('download chunk rejected');}"
            + "if(!b.finishDownload(t))throw new Error('download incomplete');"
            + "}catch(e){try{b.failDownload(t);}catch(ignore){}}"
            + "})()";
        web.evaluateJavascript(script, null);
    }

    private String sanitizeMimeType(String mimeType) {
        if (mimeType == null) return "application/octet-stream";
        String normalized = mimeType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        return SAFE_MIME.matcher(normalized).matches()
            ? normalized
            : "application/octet-stream";
    }

    private String sanitizeFileName(String fileName, String mimeType) {
        String safe = fileName == null ? "" : fileName;
        safe = safe.replaceAll("[\\p{Cntrl}\\\\/:*?\"<>|]", "_").trim();
        while (safe.startsWith(".")) safe = safe.substring(1);
        if (safe.length() > 96) safe = safe.substring(0, 96);
        if (safe.isEmpty()) safe = "flipgame-export";
        if (safe.indexOf('.') < 0) {
            String extension = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
            if (extension != null && !extension.isEmpty()) safe += "." + extension;
        }
        return safe;
    }

    private void queueCompletedExport(PendingExport completed) {
        synchronized (exportLock) {
            if (destroyed) {
                completed.delete();
                return;
            }
            exportQueue.add(completed);
        }
        runOnUiThread(this::beginSaveIfIdle);
    }

    private void beginSaveIfIdle() {
        PendingExport next;
        synchronized (exportLock) {
            if (destroyed || activeExport != null) return;
            next = exportQueue.poll();
            if (next == null) return;
            activeExport = next;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.setType(next.mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, next.fileName);
        try {
            startActivityForResult(intent, EXPORT_CREATE_REQUEST);
        } catch (RuntimeException error) {
            completeActiveExport(next, "No save location picker is available.");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST) {
            ValueCallback<Uri[]> callback = fileChooserCallback;
            fileChooserCallback = null;
            if (callback != null) {
                callback.onReceiveValue(resultCode == RESULT_OK ? selectedUris(data) : null);
            }
            return;
        }
        if (requestCode != EXPORT_CREATE_REQUEST) return;

        PendingExport pending;
        synchronized (exportLock) {
            pending = activeExport;
        }
        if (pending == null) return;
        Uri destination = resultCode == RESULT_OK && data != null ? data.getData() : null;
        if (destination == null) {
            completeActiveExport(pending, null);
            return;
        }

        final int takeFlags = data.getFlags()
            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        if (takeFlags != 0) {
            try {
                getContentResolver().takePersistableUriPermission(destination, takeFlags);
            } catch (SecurityException | IllegalArgumentException ignored) {
                // The one-time URI grant remains sufficient for this copy.
            }
        }
        new Thread(() -> copyExport(pending, destination), "flipgame-export").start();
    }

    private Uri[] selectedUris(Intent data) {
        if (data == null) return null;
        ArrayList<Uri> values = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int index = 0; index < clip.getItemCount(); index++) {
                Uri uri = clip.getItemAt(index).getUri();
                if (uri != null && !values.contains(uri)) values.add(uri);
            }
        } else if (data.getData() != null) {
            values.add(data.getData());
        }
        return values.isEmpty() ? null : values.toArray(new Uri[0]);
    }

    private void copyExport(PendingExport pending, Uri destination) {
        boolean saved;
        try (InputStream input = new FileInputStream(pending.file);
             OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
            if (output == null) throw new IOException("The selected destination is unavailable.");
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) >= 0) {
                if (count > 0) output.write(buffer, 0, count);
            }
            output.flush();
            saved = true;
        } catch (IOException | SecurityException ignored) {
            saved = false;
        }
        final boolean result = saved;
        runOnUiThread(() -> completeActiveExport(
            pending,
            result ? "Export saved." : "The export could not be saved."));
    }

    private void completeActiveExport(PendingExport pending, String message) {
        synchronized (exportLock) {
            if (activeExport == pending) activeExport = null;
        }
        pending.delete();
        if (message != null) showToast(message);
        if (!destroyed) beginSaveIfIdle();
    }

    private void showToast(String message) {
        if (message == null || destroyed) return;
        runOnUiThread(() -> {
            if (!destroyed) Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
        });
    }

    private final class PlatformBridge {
        @JavascriptInterface
        public void setMatchActive(boolean active) {
            runOnUiThread(() -> {
                if (destroyed) return;
                if (active) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }
    }

    private final class FileBridge {
        @JavascriptInterface
        public boolean beginDownload(
            String token,
            String fileName,
            String mimeType,
            long expectedBytes
        ) {
            if (destroyed || token == null || !SAFE_TOKEN.matcher(token).matches()
                || expectedBytes < 0 || expectedBytes > MAX_EXPORT_BYTES) {
                return false;
            }
            try {
                File directory = new File(getCacheDir(), "exports");
                if (!directory.exists() && !directory.mkdirs()) return false;
                File file = File.createTempFile("flipgame-", ".part", directory);
                ExportTransfer transfer = new ExportTransfer(
                    token,
                    sanitizeFileName(fileName, sanitizeMimeType(mimeType)),
                    sanitizeMimeType(mimeType),
                    expectedBytes,
                    file);
                synchronized (exportLock) {
                    if (destroyed) {
                        transfer.abort();
                        return false;
                    }
                    ExportTransfer replaced = exportTransfers.put(token, transfer);
                    if (replaced != null) replaced.abort();
                }
                return true;
            } catch (IOException | RuntimeException error) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean appendDownload(String token, String base64Chunk) {
            if (base64Chunk == null || base64Chunk.length() > MAX_EXPORT_CHUNK_BASE64) return false;
            ExportTransfer transfer;
            synchronized (exportLock) {
                transfer = exportTransfers.get(token);
            }
            return transfer != null && transfer.append(base64Chunk);
        }

        @JavascriptInterface
        public boolean finishDownload(String token) {
            ExportTransfer transfer;
            synchronized (exportLock) {
                transfer = exportTransfers.remove(token);
            }
            if (transfer == null) return false;
            PendingExport completed = transfer.finish();
            if (completed == null) {
                transfer.abort();
                return false;
            }
            queueCompletedExport(completed);
            return true;
        }

        @JavascriptInterface
        public void failDownload(String token) {
            ExportTransfer transfer;
            synchronized (exportLock) {
                transfer = exportTransfers.remove(token);
            }
            if (transfer != null) transfer.abort();
        }
    }

    private static final class ExportTransfer {
        final String token;
        final String fileName;
        final String mimeType;
        final long expectedBytes;
        final File file;
        private FileOutputStream output;
        private long receivedBytes;
        private boolean closed;

        ExportTransfer(
            String token,
            String fileName,
            String mimeType,
            long expectedBytes,
            File file
        ) throws IOException {
            this.token = token;
            this.fileName = fileName;
            this.mimeType = mimeType;
            this.expectedBytes = expectedBytes;
            this.file = file;
            this.output = new FileOutputStream(file);
        }

        synchronized boolean append(String encoded) {
            if (closed) return false;
            try {
                byte[] decoded = Base64.decode(encoded, Base64.DEFAULT);
                if (receivedBytes + decoded.length > expectedBytes
                    || receivedBytes + decoded.length > MAX_EXPORT_BYTES) {
                    return false;
                }
                output.write(decoded);
                receivedBytes += decoded.length;
                return true;
            } catch (IOException | IllegalArgumentException error) {
                return false;
            }
        }

        synchronized PendingExport finish() {
            if (closed) return null;
            try {
                output.flush();
                output.close();
                closed = true;
                output = null;
                if (receivedBytes != expectedBytes) return null;
                return new PendingExport(token, fileName, mimeType, file);
            } catch (IOException error) {
                closed = true;
                output = null;
                return null;
            }
        }

        synchronized void abort() {
            if (!closed && output != null) {
                try {
                    output.close();
                } catch (IOException ignored) {
                    // Best effort cleanup.
                }
            }
            output = null;
            closed = true;
            if (file.exists()) file.delete();
        }
    }

    private static final class PendingExport {
        final String token;
        final String fileName;
        final String mimeType;
        final File file;

        PendingExport(String token, String fileName, String mimeType, File file) {
            this.token = token;
            this.fileName = fileName;
            this.mimeType = mimeType;
            this.file = file;
        }

        void delete() {
            if (file.exists()) file.delete();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        hideSystemBars();
    }

    @Override
    protected void onPause() {
        if (web != null) web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        destroyed = true;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        cancelFileChooser();
        synchronized (exportLock) {
            for (ExportTransfer transfer : exportTransfers.values()) transfer.abort();
            exportTransfers.clear();
            for (PendingExport pending : exportQueue) pending.delete();
            exportQueue.clear();
            if (activeExport != null) activeExport.delete();
            activeExport = null;
        }
        if (web != null) {
            web.setDownloadListener(null);
            web.setWebChromeClient(null);
            web.removeJavascriptInterface(PLATFORM_BRIDGE);
            web.removeJavascriptInterface(FILE_BRIDGE);
            web.stopLoading();
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
