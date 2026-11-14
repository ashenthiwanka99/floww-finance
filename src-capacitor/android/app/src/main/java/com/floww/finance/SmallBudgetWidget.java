package com.floww.finance;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

public class SmallBudgetWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        JSONObject s = WidgetHelper.snapshot(context);
        for (int id : ids) {
            manager.updateAppWidget(id, render(context, s));
        }
    }

    private RemoteViews render(Context context, JSONObject s) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_small_budget);
        v.setOnClickPendingIntent(android.R.id.background, WidgetHelper.openApp(context, 1));
        v.setTextViewText(R.id.wsb_days, WidgetHelper.daysLeft(s));
        WidgetHelper.bar(v, R.id.wsb_bar_base, R.id.wsb_bar_plan, s);

        if (s == null) {
            v.setTextViewText(R.id.wsb_amount, "-");
            WidgetHelper.textColor(context, v, R.id.wsb_amount, R.color.widget_text_muted);
            v.setTextViewText(R.id.wsb_sub, "Open Floww to load");
            return v;
        }

        v.setTextViewText(R.id.wsb_amount, WidgetHelper.text(s, "left"));
        WidgetHelper.textColor(context, v, R.id.wsb_amount,
            s.optBoolean("leftNegative") ? R.color.widget_negative : R.color.widget_text);
        String sub = WidgetHelper.text(s, "sub");
        v.setTextViewText(R.id.wsb_sub, sub.isEmpty() ? "of " + WidgetHelper.text(s, "moved") + " moved in" : sub);
        return v;
    }
}
