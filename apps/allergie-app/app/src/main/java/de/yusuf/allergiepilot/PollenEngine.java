package de.yusuf.allergiepilot;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Lädt Pollen-, Luftqualitäts- und Wetterdaten und fasst sie zu einem Bericht zusammen.
 * Quellen: Open-Meteo Air Quality (CAMS, standortgenau) und DWD Pollenflug-Gefahrenindex (Region).
 * Wird von der Oberfläche und vom Hintergrund-Job genutzt.
 */
public final class PollenEngine {

    private static final String TAG = "PollenEngine";
    private static final String UA = "AllergiePilot/1.0 (Android; privat)";
    private static final String DWD_URL =
            "https://opendata.dwd.de/climate_environment/health/alerts/s31fg.json";
    private static final int FORECAST_DAYS = 4;

    private static JSONObject catalogCache;

    private PollenEngine() {
    }

    public static synchronized JSONObject catalog(Context ctx) {
        if (catalogCache == null) {
            try {
                catalogCache = new JSONObject(readAsset(ctx, "www/catalog.json"));
            } catch (Exception e) {
                throw new IllegalStateException("catalog.json fehlt oder ist ungültig", e);
            }
        }
        return catalogCache;
    }

    public static String readAsset(Context ctx, String path) throws IOException {
        try (InputStream in = ctx.getAssets().open(path)) {
            return readAll(in);
        }
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
        }
        return out.toString(StandardCharsets.UTF_8.name());
    }

    public static String httpGet(String url) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setConnectTimeout(15000);
        con.setReadTimeout(20000);
        con.setRequestProperty("User-Agent", UA);
        con.setRequestProperty("Accept", "application/json");
        try {
            int code = con.getResponseCode();
            if (code < 200 || code >= 300) {
                throw new IOException("HTTP " + code + " für " + url);
            }
            try (InputStream in = con.getInputStream()) {
                return readAll(in);
            }
        } finally {
            con.disconnect();
        }
    }

    /** Stufe 0–4 aus Pollenkonzentration (Körner/m³) und Schwellen [gering, mittel, hoch, sehr hoch]. */
    public static int levelFor(double value, JSONArray thr) {
        int level = 0;
        for (int i = 0; i < thr.length(); i++) {
            if (value >= thr.optDouble(i)) {
                level = i + 1;
            }
        }
        return level;
    }

    /** DWD-Index ("0", "0-1", … "3") auf Stufe 0–3; -1 = keine Angabe. */
    public static int dwdLevel(String raw) {
        if (raw == null) {
            return -1;
        }
        switch (raw.trim()) {
            case "0":
                return 0;
            case "0-1":
            case "1":
                return 1;
            case "1-2":
            case "2":
                return 2;
            case "2-3":
            case "3":
                return 3;
            default:
                return -1;
        }
    }

    /** Nächstgelegene DWD-Teilregion, nur innerhalb Deutschlands. */
    public static JSONObject nearestRegion(JSONObject catalog, double lat, double lon) {
        if (lat < 47.2 || lat > 55.1 || lon < 5.8 || lon > 15.1) {
            return null;
        }
        JSONArray regions = catalog.optJSONArray("dwdRegions");
        JSONObject best = null;
        double bestDist = Double.MAX_VALUE;
        double cosLat = Math.cos(Math.toRadians(lat));
        for (int i = 0; regions != null && i < regions.length(); i++) {
            JSONObject r = regions.optJSONObject(i);
            double dLat = r.optDouble("lat") - lat;
            double dLon = (r.optDouble("lon") - lon) * cosLat;
            double d = dLat * dLat + dLon * dLon;
            if (d < bestDist) {
                bestDist = d;
                best = r;
            }
        }
        return best;
    }

    private static JSONObject regionById(JSONObject catalog, int id) {
        JSONArray regions = catalog.optJSONArray("dwdRegions");
        for (int i = 0; regions != null && i < regions.length(); i++) {
            JSONObject r = regions.optJSONObject(i);
            if (r.optInt("id") == id) {
                return r;
            }
        }
        return null;
    }

    public static JSONObject buildReport(Context ctx, double lat, double lon, String name,
                                         String source, int regionOverride) throws JSONException {
        JSONObject catalog = catalog(ctx);
        JSONArray allergens = catalog.getJSONArray("allergens");
        JSONArray errors = new JSONArray();

        JSONObject report = new JSONObject();
        report.put("fetchedAt", System.currentTimeMillis());
        JSONObject loc = new JSONObject();
        loc.put("lat", lat);
        loc.put("lon", lon);
        loc.put("name", name);
        loc.put("source", source);
        report.put("location", loc);

        JSONObject region = regionOverride > 0 ? regionById(catalog, regionOverride)
                : nearestRegion(catalog, lat, lon);
        report.put("region", region == null ? JSONObject.NULL : region);

        // --- Open-Meteo Air Quality ---
        StringBuilder vars = new StringBuilder("european_aqi");
        for (int i = 0; i < allergens.length(); i++) {
            String om = allergens.getJSONObject(i).optString("om", "");
            if (!om.isEmpty()) {
                vars.append(',').append(om);
            }
        }
        JSONObject aq = null;
        try {
            aq = new JSONObject(httpGet(String.format(Locale.US,
                    "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=%.4f&longitude=%.4f"
                            + "&hourly=%s&timezone=auto&forecast_days=%d",
                    lat, lon, vars, FORECAST_DAYS)));
        } catch (Exception e) {
            Log.w(TAG, "Open-Meteo Luftqualität fehlgeschlagen", e);
            errors.put("Open-Meteo Pollen: " + e.getMessage());
        }

        List<String> days = new ArrayList<>();
        int nowIndex = -1;
        JSONObject hourly = null;
        if (aq != null) {
            hourly = aq.optJSONObject("hourly");
            int offset = aq.optInt("utc_offset_seconds", 0);
            SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:00", Locale.US);
            fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
            String nowKey = fmt.format(new Date(System.currentTimeMillis() + offset * 1000L));
            JSONArray times = hourly != null ? hourly.optJSONArray("time") : null;
            for (int i = 0; times != null && i < times.length(); i++) {
                String t = times.optString(i);
                String d = t.length() >= 10 ? t.substring(0, 10) : t;
                if (!days.contains(d)) {
                    days.add(d);
                }
                if (t.equals(nowKey)) {
                    nowIndex = i;
                }
            }
        }
        if (days.isEmpty()) {
            SimpleDateFormat dayFmt = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            long now = System.currentTimeMillis();
            for (int i = 0; i < FORECAST_DAYS; i++) {
                days.add(dayFmt.format(new Date(now + i * 86400000L)));
            }
        }
        while (days.size() > FORECAST_DAYS) {
            days.remove(days.size() - 1);
        }
        report.put("days", new JSONArray(days));

        // --- DWD Pollenflug-Gefahrenindex ---
        JSONObject dwdPollen = null;
        if (region != null) {
            try {
                JSONObject dwd = new JSONObject(httpGet(DWD_URL));
                JSONArray content = dwd.optJSONArray("content");
                int wanted = region.optInt("id");
                for (int i = 0; content != null && i < content.length(); i++) {
                    JSONObject c = content.getJSONObject(i);
                    int key = c.optInt("partregion_id", -1);
                    if (key == -1) {
                        key = c.optInt("region_id", -1);
                    }
                    if (key == wanted) {
                        dwdPollen = c.optJSONObject("Pollen");
                        break;
                    }
                }
                report.put("dwdUpdate", dwd.optString("last_update", ""));
                if (dwdPollen == null) {
                    errors.put("DWD: Region " + wanted + " nicht gefunden");
                }
            } catch (Exception e) {
                Log.w(TAG, "DWD fehlgeschlagen", e);
                errors.put("DWD Pollenflug: " + e.getMessage());
            }
        }

        // --- Pro Allergen zusammenführen ---
        JSONObject result = new JSONObject();
        for (int i = 0; i < allergens.length(); i++) {
            JSONObject a = allergens.getJSONObject(i);
            String om = a.optString("om", "");
            String dwdKey = a.optString("dwd", "");
            if (om.isEmpty() && dwdKey.isEmpty()) {
                continue;
            }
            JSONObject r = new JSONObject();
            Integer[] combined = new Integer[FORECAST_DAYS];
            JSONArray thr = a.optJSONArray("thr");

            if (!om.isEmpty() && hourly != null && hourly.optJSONArray(om) != null && thr != null) {
                JSONArray values = hourly.optJSONArray(om);
                JSONArray times = hourly.optJSONArray("time");
                JSONArray daily = new JSONArray();
                JSONArray dailyMax = new JSONArray();
                JSONArray levels = new JSONArray();
                for (int d = 0; d < days.size(); d++) {
                    String day = days.get(d);
                    double sum = 0;
                    int count = 0;
                    double max = -1;
                    for (int h = 0; h < values.length(); h++) {
                        String t = times.optString(h);
                        if (!t.startsWith(day) || values.isNull(h)) {
                            continue;
                        }
                        double v = values.optDouble(h);
                        max = Math.max(max, v);
                        int hour = Integer.parseInt(t.substring(11, 13));
                        // Tagesmittel über die Stunden mit relevantem Pollenflug
                        if (hour >= 6 && hour <= 20) {
                            sum += v;
                            count++;
                        }
                    }
                    if (count > 0) {
                        double mean = sum / count;
                        daily.put(Math.round(mean * 10) / 10.0);
                        dailyMax.put(Math.round(max * 10) / 10.0);
                        int lvl = levelFor(mean, thr);
                        levels.put(lvl);
                        combined[d] = lvl;
                    } else {
                        daily.put(JSONObject.NULL);
                        dailyMax.put(JSONObject.NULL);
                        levels.put(JSONObject.NULL);
                    }
                }
                r.put("omDaily", daily);
                r.put("omDailyMax", dailyMax);
                r.put("omLevels", levels);
                if (nowIndex >= 0 && !values.isNull(nowIndex)) {
                    double cur = values.optDouble(nowIndex);
                    r.put("omCurrent", Math.round(cur * 10) / 10.0);
                    r.put("omCurrentLevel", levelFor(cur, thr));
                }
            }

            if (!dwdKey.isEmpty() && dwdPollen != null && dwdPollen.optJSONObject(dwdKey) != null) {
                JSONObject p = dwdPollen.optJSONObject(dwdKey);
                String[] keys = {"today", "tomorrow", "dayafter_to"};
                JSONArray raw = new JSONArray();
                JSONArray levels = new JSONArray();
                for (int d = 0; d < keys.length; d++) {
                    String v = p.optString(keys[d], "-1");
                    raw.put(v);
                    int lvl = dwdLevel(v);
                    levels.put(lvl < 0 ? JSONObject.NULL : lvl);
                    if (lvl >= 0) {
                        combined[d] = combined[d] == null ? lvl : Math.max(combined[d], lvl);
                    }
                }
                r.put("dwdRaw", raw);
                r.put("dwdLevels", levels);
            }

            JSONArray comb = new JSONArray();
            for (Integer c : combined) {
                comb.put(c == null ? JSONObject.NULL : c);
            }
            r.put("levels", comb);
            int current = r.has("omCurrentLevel") ? r.getInt("omCurrentLevel")
                    : (combined[0] != null ? combined[0] : -1);
            if (current >= 0) {
                r.put("currentLevel", current);
            }
            if (r.has("omLevels") || r.has("dwdLevels")) {
                result.put(a.getString("id"), r);
            }
        }
        report.put("allergens", result);

        // --- Luftqualität (europäischer AQI) ---
        if (hourly != null && hourly.optJSONArray("european_aqi") != null) {
            JSONArray aqi = hourly.optJSONArray("european_aqi");
            JSONObject aqiObj = new JSONObject();
            if (nowIndex >= 0 && !aqi.isNull(nowIndex)) {
                aqiObj.put("current", aqi.optInt(nowIndex));
            }
            JSONArray times = hourly.optJSONArray("time");
            JSONArray max = new JSONArray();
            for (String day : days) {
                int m = -1;
                for (int h = 0; h < aqi.length(); h++) {
                    if (times.optString(h).startsWith(day) && !aqi.isNull(h)) {
                        m = Math.max(m, aqi.optInt(h));
                    }
                }
                max.put(m < 0 ? JSONObject.NULL : m);
            }
            aqiObj.put("max", max);
            report.put("aqi", aqiObj);
        }

        // --- Wetter (Regen/Wind beeinflussen den Pollenflug) ---
        try {
            JSONObject w = new JSONObject(httpGet(String.format(Locale.US,
                    "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f"
                            + "&daily=precipitation_sum,precipitation_probability_max,wind_speed_10m_max,temperature_2m_max"
                            + "&timezone=auto&forecast_days=%d",
                    lat, lon, FORECAST_DAYS)));
            report.put("weather", w.optJSONObject("daily"));
        } catch (Exception e) {
            Log.w(TAG, "Wetter fehlgeschlagen", e);
            errors.put("Wetter: " + e.getMessage());
        }

        report.put("errors", errors);
        return report;
    }

    /** Ab welcher Stufe gewarnt wird: stark → Gering, mittel → Mittel, leicht → Hoch; Asthma eine Stufe früher. */
    public static int warnLevel(int severity, boolean asthma) {
        int lvl = 4 - Math.max(1, Math.min(3, severity));
        if (asthma) {
            lvl--;
        }
        return Math.max(1, lvl);
    }

    /** Heutige Stufe eines Allergens im Bericht (Maximum aus Tageswert und aktuellem Wert), -1 = keine Daten. */
    public static int todayLevel(JSONObject report, String id) {
        JSONObject r = report.optJSONObject("allergens") != null
                ? report.optJSONObject("allergens").optJSONObject(id) : null;
        if (r == null) {
            return -1;
        }
        int lvl = -1;
        JSONArray levels = r.optJSONArray("levels");
        if (levels != null && !levels.isNull(0)) {
            lvl = levels.optInt(0);
        }
        return Math.max(lvl, r.optInt("currentLevel", -1));
    }
}
