package com.floww.finance;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class WidgetHelper {

    static final long NO_DATE = Long.MIN_VALUE;
    private static final String PREFS = "FlowwWidget";
    private static final String KEY = "snapshot";

    public static void saveSnapshot(Context context, String json) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply();
    }

    public static JSONObject snapshot(Context context) {
        try {
            String json = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
            return json == null ? null : new JSONObject(json);
        } catch (Exception e) {
            return null;
        }
    }

    public static PendingIntent openApp(Context context, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    public static void textColor(Context context, RemoteViews views, int viewId, int colorRes) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            views.setColorStateList(viewId, "setTextColor", colorRes);
        } else {
            views.setTextColor(viewId, context.getColor(colorRes));
        }
    }

    public static void bar(RemoteViews views, int baseId, int planId, JSONObject s) {
        JSONObject bar = s == null ? null : s.optJSONObject("bar");
        int out = bar == null ? 0 : bar.optInt("out");
        int due = bar == null ? 0 : bar.optInt("due");
        int over = bar == null ? 0 : bar.optInt("over");
        views.setProgressBar(baseId, 1000, Math.min(1000, out + due + over), false);
        views.setProgressBar(planId, 1000, out, false);
        views.setInt(planId, "setSecondaryProgress", Math.min(1000, out + due));
    }

    public static String text(JSONObject o, String key) {
        if (o == null || o.isNull(key)) return "";
        return o.optString(key, "");
    }

    public static String daysLeft(JSONObject s) {
        long days = daysFromToday(text(s, "cycleEnd"));
        if (days == NO_DATE) return "";
        days += 1;
        if (days < 1) return "Cycle ended";
        return days == 1 ? "Last day" : days + " days left";
    }

    public static long daysFromToday(String isoDate) {
        if (isoDate == null || isoDate.length() < 10) return NO_DATE;
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            Date target = f.parse(isoDate.substring(0, 10));
            Date today = f.parse(f.format(new Date()));
            return Math.round((target.getTime() - today.getTime()) / 86400000d);
        } catch (Exception e) {
            return NO_DATE;
        }
    }

    public static String dueLabel(String isoDate) {
        long days = daysFromToday(isoDate);
        if (days == NO_DATE) return "";
        if (days < 0) return (-days) + "d overdue";
        if (days == 0) return "Today";
        if (days == 1) return "Tomorrow";
        try {
            Date d = new SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(isoDate.substring(0, 10));
            return "Due " + new SimpleDateFormat("d MMM", Locale.US).format(d);
        } catch (Exception e) {
            return "";
        }
    }
}
