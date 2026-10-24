package de.yusuf.allergiepilot;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Address;
import android.location.Geocoder;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Zeigt die Web-Oberfläche (assets/www) und stellt ihr native Funktionen über "Android" bereit. */
public class MainActivity extends Activity {

    private static final String TAG = "MainActivity";
    private static final int REQ_LOCATION = 1;
    private static final int REQ_NOTIFY = 2;
    private static final long FRESH_FIX_MS = 15 * 60 * 1000L;

    private final ExecutorService io = Executors.newCachedThreadPool();
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView web;
    private String pendingLocationCb;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(0xFF141414);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("file".equals(uri.getScheme())) {
                    return false;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
        Store.ensureChannel(this);
        Store.scheduleChecks(this);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onBack ? window.onBack() : false", value -> {
            if (!"true".equals(value)) {
                MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onDestroy() {
        io.shutdownNow();
        web.destroy();
        super.onDestroy();
    }

    private void callback(String id, boolean ok, String payload) {
        String js = "window.__cb && window.__cb(" + JSONObject.quote(id) + "," + ok + ","
                + JSONObject.quote(payload == null ? "" : payload) + ")";
        main.post(() -> web.evaluateJavascript(js, null));
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_LOCATION && pendingLocationCb != null) {
            String cb = pendingLocationCb;
            pendingLocationCb = null;
            if (hasLocationPermission()) {
                locate(cb);
            } else {
                callback(cb, false, "Standortberechtigung abgelehnt. Du kannst in den Einstellungen einen Ort manuell wählen.");
            }
        }
        if (requestCode == REQ_NOTIFY) {
            main.post(() -> web.evaluateJavascript("window.onNotifyPermission && window.onNotifyPermission()", null));
        }
    }

    /** Ermittelt den Standort und liefert {lat, lon, name} an die Oberfläche. */
    @SuppressLint("MissingPermission")
    private void locate(String cb) {
        LocationManager lm = getSystemService(LocationManager.class);
        Location last = CheckJobService.lastKnown(this);
        if (last != null && System.currentTimeMillis() - last.getTime() < FRESH_FIX_MS) {
            deliverLocation(cb, last);
            return;
        }
        String provider = null;
        if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
            provider = LocationManager.NETWORK_PROVIDER;
        } else if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
            provider = LocationManager.GPS_PROVIDER;
        }
        if (provider == null) {
            if (last != null) {
                deliverLocation(cb, last);
            } else {
                callback(cb, false, "Standortdienste sind deaktiviert. Bitte in den Schnelleinstellungen aktivieren.");
            }
            return;
        }

        AtomicBoolean done = new AtomicBoolean(false);
        Location fallback = last;
        Runnable timeout = () -> {
            if (done.compareAndSet(false, true)) {
                if (fallback != null) {
                    deliverLocation(cb, fallback);
                } else {
                    callback(cb, false, "Standort konnte nicht ermittelt werden (Zeitüberschreitung).");
                }
            }
        };
        main.postDelayed(timeout, 25000);

        try {
            if (Build.VERSION.SDK_INT >= 30) {
                CancellationSignal cancel = new CancellationSignal();
                lm.getCurrentLocation(provider, cancel, getMainExecutor(), loc -> {
                    if (loc != null && done.compareAndSet(false, true)) {
                        main.removeCallbacks(timeout);
                        deliverLocation(cb, loc);
                    }
                });
            } else {
                LocationListener listener = new LocationListener() {
                    @Override
                    public void onLocationChanged(Location loc) {
                        lm.removeUpdates(this);
                        if (done.compareAndSet(false, true)) {
                            main.removeCallbacks(timeout);
                            deliverLocation(cb, loc);
                        }
                    }

                    @Override
                    public void onStatusChanged(String p, int status, Bundle extras) {
                    }

                    @Override
                    public void onProviderEnabled(String p) {
                    }

                    @Override
                    public void onProviderDisabled(String p) {
                    }
                };
                lm.requestLocationUpdates(provider, 0, 0, listener, Looper.getMainLooper());
            }
        } catch (SecurityException e) {
            done.set(true);
            main.removeCallbacks(timeout);
            callback(cb, false, "Keine Standortberechtigung.");
        }
    }

    private void deliverLocation(String cb, Location loc) {
        io.execute(() -> {
            String name = "";
            try {
                if (Geocoder.isPresent()) {
                    @SuppressWarnings("deprecation")
                    List<Address> list = new Geocoder(this, Locale.GERMANY)
                            .getFromLocation(loc.getLatitude(), loc.getLongitude(), 1);
                    if (list != null && !list.isEmpty()) {
                        Address a = list.get(0);
                        name = a.getLocality() != null ? a.getLocality()
                                : a.getSubAdminArea() != null ? a.getSubAdminArea() : "";
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Geocoder fehlgeschlagen", e);
            }
            try {
                JSONObject o = new JSONObject();
                o.put("lat", loc.getLatitude());
                o.put("lon", loc.getLongitude());
                o.put("name", name);
                o.put("ts", System.currentTimeMillis());
                Store.put(this, Store.KEY_LAST_LOC, o.toString());
                callback(cb, true, o.toString());
            } catch (Exception e) {
                callback(cb, false, e.getMessage());
            }
        });
    }

    /** Schnittstelle für JavaScript (window.Android). */
    private class Bridge {

        @JavascriptInterface
        public String getCatalog() {
            return PollenEngine.catalog(MainActivity.this).toString();
        }

        @JavascriptInterface
        public String getProfile() {
            return Store.get(MainActivity.this, Store.KEY_PROFILE);
        }

        @JavascriptInterface
        public void saveProfile(String json) {
            Store.put(MainActivity.this, Store.KEY_PROFILE, json);
            Store.scheduleChecks(MainActivity.this);
        }

        @JavascriptInterface
        public String getCachedReport() {
            return Store.get(MainActivity.this, Store.KEY_REPORT);
        }

        @JavascriptInterface
        public String getLastLocation() {
            return Store.get(MainActivity.this, Store.KEY_LAST_LOC);
        }

        @JavascriptInterface
        public boolean hasLocationPermission() {
            return MainActivity.this.hasLocationPermission();
        }

        @JavascriptInterface
        public void requestLocation(String cb) {
            main.post(() -> {
                if (MainActivity.this.hasLocationPermission()) {
                    locate(cb);
                } else {
                    pendingLocationCb = cb;
                    requestPermissions(new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
                }
            });
        }

        /** Lädt den Bericht für die Koordinaten und speichert ihn als letzten Stand. */
        @JavascriptInterface
        public void loadReport(double lat, double lon, String name, String source, int region, String cb) {
            io.execute(() -> {
                try {
                    JSONObject report = PollenEngine.buildReport(MainActivity.this, lat, lon, name, source, region);
                    String json = report.toString();
                    Store.put(MainActivity.this, Store.KEY_REPORT, json);
                    callback(cb, true, json);
                } catch (Exception e) {
                    Log.w(TAG, "Bericht fehlgeschlagen", e);
                    callback(cb, false, String.valueOf(e.getMessage()));
                }
            });
        }

        @JavascriptInterface
        public void searchPlace(String query, String cb) {
            io.execute(() -> {
                try {
                    String url = "https://geocoding-api.open-meteo.com/v1/search?count=8&language=de&format=json&name="
                            + URLEncoder.encode(query, "UTF-8");
                    JSONObject res = new JSONObject(PollenEngine.httpGet(url));
                    JSONArray list = res.optJSONArray("results");
                    callback(cb, true, list == null ? "[]" : list.toString());
                } catch (Exception e) {
                    callback(cb, false, String.valueOf(e.getMessage()));
                }
            });
        }

        @JavascriptInterface
        public boolean notificationsAllowed() {
            if (Build.VERSION.SDK_INT >= 33) {
                return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED;
            }
            return true;
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            if (Build.VERSION.SDK_INT >= 33) {
                main.post(() -> requestPermissions(
                        new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY));
            }
        }

        @JavascriptInterface
        public void testNotification() {
            Store.notify(MainActivity.this, "AllergiePilot",
                    "So sehen Warnungen aus. Die App prüft etwa alle 3 Stunden deinen Standort.");
        }

        @JavascriptInterface
        public void runBackgroundCheckNow() {
            io.execute(() -> {
                try {
                    Store.put(MainActivity.this, Store.KEY_NOTIFIED, "");
                    CheckJobService.runCheck(MainActivity.this);
                } catch (Exception e) {
                    Log.w(TAG, "Sofortprüfung fehlgeschlagen", e);
                }
            });
        }

        @JavascriptInterface
        public void openUrl(String url) {
            main.post(() -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }
    }
}
