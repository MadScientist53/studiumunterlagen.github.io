package de.yusuf.allergiepilot;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

/** Lokale Datenhaltung (Profil, letzter Bericht, Standort), Benachrichtigungen und Hintergrund-Job. */
public final class Store {

    private static final String PREFS = "allergiepilot";
    public static final String KEY_PROFILE = "profile";
    public static final String KEY_REPORT = "report";
    public static final String KEY_LAST_LOC = "lastLoc";
    public static final String KEY_NOTIFIED = "notified";

    private static final String CHANNEL_WARN = "warnings";
    private static final int JOB_ID = 1001;
    private static final int NOTIFICATION_ID = 2001;

    private Store() {
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String get(Context ctx, String key) {
        return prefs(ctx).getString(key, "");
    }

    public static void put(Context ctx, String key, String value) {
        prefs(ctx).edit().putString(key, value).apply();
    }

    public static JSONObject getJson(Context ctx, String key) {
        String s = get(ctx, key);
        if (s.isEmpty()) {
            return null;
        }
        try {
            return new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    public static void ensureChannel(Context ctx) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL_WARN) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_WARN,
                    ctx.getString(R.string.channel_warnings), NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription(ctx.getString(R.string.channel_warnings_desc));
            nm.createNotificationChannel(ch);
        }
    }

    public static void notify(Context ctx, String title, String text) {
        ensureChannel(ctx);
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n = new Notification.Builder(ctx, CHANNEL_WARN)
                .setSmallIcon(R.drawable.ic_stat_pollen)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(pi)
                .setAutoCancel(true)
                .build();
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 33 && !nm.areNotificationsEnabled()) {
            return;
        }
        nm.notify(NOTIFICATION_ID, n);
    }

    /** Plant die regelmäßige Prüfung (ca. alle 3 Stunden) oder entfernt sie, wenn Warnungen aus sind. */
    public static void scheduleChecks(Context ctx) {
        JobScheduler js = ctx.getSystemService(JobScheduler.class);
        JSONObject profile = getJson(ctx, KEY_PROFILE);
        boolean enabled = profile != null && profile.optBoolean("notify", true);
        if (!enabled) {
            js.cancel(JOB_ID);
            return;
        }
        if (js.getPendingJob(JOB_ID) != null) {
            return;
        }
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(ctx, CheckJobService.class))
                .setPeriodic(TimeUnit.HOURS.toMillis(3), TimeUnit.HOURS.toMillis(1))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build();
        js.schedule(job);
    }
}
