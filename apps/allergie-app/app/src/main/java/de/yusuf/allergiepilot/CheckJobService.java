package de.yusuf.allergiepilot;

import android.Manifest;
import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

/** Prüft im Hintergrund die Belastung am letzten Standort und warnt bei persönlichen Allergenen. */
public class CheckJobService extends JobService {

    private static final String TAG = "CheckJob";

    @Override
    public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            try {
                runCheck(getApplicationContext());
            } catch (Exception e) {
                Log.w(TAG, "Prüfung fehlgeschlagen", e);
            }
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }

    static void runCheck(Context ctx) throws Exception {
        JSONObject profile = Store.getJson(ctx, Store.KEY_PROFILE);
        if (profile == null || !profile.optBoolean("notify", true)) {
            return;
        }
        JSONObject allergies = profile.optJSONObject("allergies");
        if (allergies == null || allergies.length() == 0) {
            return;
        }

        double lat;
        double lon;
        String name;
        String source;
        JSONObject manual = profile.optJSONObject("manual");
        if ("manual".equals(profile.optString("locMode")) && manual != null) {
            lat = manual.getDouble("lat");
            lon = manual.getDouble("lon");
            name = manual.optString("name");
            source = "manual";
        } else {
            JSONObject last = Store.getJson(ctx, Store.KEY_LAST_LOC);
            Location fresh = lastKnown(ctx);
            if (fresh != null && (last == null || fresh.getTime() > last.optLong("ts"))) {
                lat = fresh.getLatitude();
                lon = fresh.getLongitude();
                name = last != null && distanceKm(last, lat, lon) < 5 ? last.optString("name") : "";
            } else if (last != null) {
                lat = last.getDouble("lat");
                lon = last.getDouble("lon");
                name = last.optString("name");
            } else {
                return;
            }
            source = "gps";
        }

        int region = profile.optInt("dwdRegion", 0);
        JSONObject report = PollenEngine.buildReport(ctx, lat, lon, name, source, region);
        Store.put(ctx, Store.KEY_REPORT, report.toString());

        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        if (hour < 6 || hour >= 22) {
            return; // nachts nicht stören
        }

        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        JSONObject notified = Store.getJson(ctx, Store.KEY_NOTIFIED);
        if (notified == null || !today.equals(notified.optString("date"))) {
            notified = new JSONObject().put("date", today).put("levels", new JSONObject());
        }
        JSONObject sent = notified.getJSONObject("levels");

        JSONObject catalog = PollenEngine.catalog(ctx);
        JSONArray levelNames = catalog.getJSONArray("levels");
        boolean asthma = profile.optBoolean("asthma");
        List<String> lines = new ArrayList<>();
        boolean anyNew = false;
        Iterator<String> it = allergies.keys();
        while (it.hasNext()) {
            String id = it.next();
            int sev = allergies.optJSONObject(id) != null ? allergies.optJSONObject(id).optInt("sev", 2) : 2;
            int level = PollenEngine.todayLevel(report, id);
            if (level < 0 || level < PollenEngine.warnLevel(sev, asthma)) {
                continue;
            }
            lines.add(nameOf(catalog, id) + ": " + levelNames.optString(level));
            if (level > sent.optInt(id, -1)) {
                anyNew = true;
                sent.put(id, level);
            }
        }

        JSONObject aqi = report.optJSONObject("aqi");
        if (asthma && aqi != null && aqi.optInt("current", 0) >= 60 && !sent.has("_aqi")) {
            lines.add("Luftqualität schlecht (EAQI " + aqi.optInt("current") + ")");
            sent.put("_aqi", 1);
            anyNew = true;
        }

        if (anyNew && !lines.isEmpty()) {
            String place = name == null || name.isEmpty() ? "deinem Standort" : name;
            Store.notify(ctx, "Pollenwarnung für " + place, String.join("\n", lines));
            Store.put(ctx, Store.KEY_NOTIFIED, notified.toString());
        }
    }

    private static String nameOf(JSONObject catalog, String id) {
        JSONArray a = catalog.optJSONArray("allergens");
        for (int i = 0; a != null && i < a.length(); i++) {
            if (id.equals(a.optJSONObject(i).optString("id"))) {
                return a.optJSONObject(i).optString("name");
            }
        }
        return id;
    }

    private static double distanceKm(JSONObject last, double lat, double lon) {
        float[] out = new float[1];
        Location.distanceBetween(last.optDouble("lat"), last.optDouble("lon"), lat, lon, out);
        return out[0] / 1000.0;
    }

    static Location lastKnown(Context ctx) {
        if (ctx.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            return null;
        }
        LocationManager lm = ctx.getSystemService(LocationManager.class);
        Location best = null;
        try {
            for (String p : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(p);
                if (l != null && (best == null || l.getTime() > best.getTime())) {
                    best = l;
                }
            }
        } catch (SecurityException e) {
            return null;
        }
        return best;
    }
}
