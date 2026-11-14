package com.floww.finance;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.util.ArrayMap;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Map;

public class FlowwWidgetProvider extends AppWidgetProvider {

    private static final float FULL_HEIGHT = 190f;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            update(context, manager, id);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        update(context, manager, id);
    }

    private void update(Context context, AppWidgetManager manager, int id) {
        JSONObject s = WidgetHelper.snapshot(context);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Map<SizeF, RemoteViews> sizes = new ArrayMap<>();
            sizes.put(new SizeF(250f, 110f), render(context, s, true));
            sizes.put(new SizeF(250f, FULL_HEIGHT), render(context, s, false));
            manager.updateAppWidget(id, new RemoteViews(sizes));
        } else {
            int height = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            manager.updateAppWidget(id, render(context, s, height > 0 && height < FULL_HEIGHT));
        }
    }

    private RemoteViews render(Context context, JSONObject s, boolean compact) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_layout);
        v.setOnClickPendingIntent(android.R.id.background, WidgetHelper.openApp(context, 0));
        v.setViewVisibility(R.id.widget_rule, compact ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.widget_figures, compact ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.widget_days, WidgetHelper.daysLeft(s));
        WidgetHelper.bar(v, R.id.widget_bar_base, R.id.widget_bar_plan, s);

        if (s == null) {
            v.setTextViewText(R.id.widget_amount, "-");
            WidgetHelper.textColor(context, v, R.id.widget_amount, R.color.widget_text_muted);
            v.setTextViewText(R.id.widget_moved, "-");
            v.setTextViewText(R.id.widget_out, "-");
            v.setTextViewText(R.id.widget_due, "-");
            showNext(context, v, "", R.color.widget_text_muted, "Open Floww to load this cycle", R.color.widget_text_muted, "");
            return v;
        }

        v.setTextViewText(R.id.widget_amount, WidgetHelper.text(s, "left"));
        WidgetHelper.textColor(context, v, R.id.widget_amount,
            s.optBoolean("leftNegative") ? R.color.widget_negative : R.color.widget_text);
        JSONObject labels = s.optJSONObject("labels");
        if (labels != null) {
            v.setTextViewText(R.id.widget_moved_label, WidgetHelper.text(labels, "moved"));
            v.setTextViewText(R.id.widget_out_label, WidgetHelper.text(labels, "out"));
            v.setTextViewText(R.id.widget_due_label, WidgetHelper.text(labels, "due"));
        }
        v.setTextViewText(R.id.widget_moved, WidgetHelper.text(s, "moved"));
        v.setTextViewText(R.id.widget_out, WidgetHelper.text(s, "out"));
        String due = WidgetHelper.text(s, "due");
        v.setTextViewText(R.id.widget_due, due);
        WidgetHelper.textColor(context, v, R.id.widget_due,
            "0".equals(due) ? R.color.widget_text_muted : R.color.widget_text);

        JSONObject next = s.optJSONObject("next");
        if (next == null) {
            showNext(context, v, "", R.color.widget_text_muted, "Nothing left to pay in this cycle", R.color.widget_text_muted, "");
        } else {
            String dueDate = WidgetHelper.text(next, "dueDate");
            long days = WidgetHelper.daysFromToday(dueDate);
            boolean overdue = days != WidgetHelper.NO_DATE && days < 0;
            showNext(context, v, WidgetHelper.dueLabel(dueDate),
                overdue ? R.color.widget_negative : R.color.widget_text_muted,
                WidgetHelper.text(next, "name"), R.color.widget_text,
                WidgetHelper.text(next, "amount"));
        }
        return v;
    }

    private void showNext(Context context, RemoteViews v, String when, int whenColor, String name, int nameColor, String amount) {
        v.setTextViewText(R.id.widget_next_when, when);
        v.setViewVisibility(R.id.widget_next_when, when.isEmpty() ? View.GONE : View.VISIBLE);
        WidgetHelper.textColor(context, v, R.id.widget_next_when, whenColor);
        v.setTextViewText(R.id.widget_next_name, name);
        WidgetHelper.textColor(context, v, R.id.widget_next_name, nameColor);
        v.setTextViewText(R.id.widget_next_amount, amount);
    }
}
