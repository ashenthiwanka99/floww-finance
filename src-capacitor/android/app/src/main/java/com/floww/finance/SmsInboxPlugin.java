package com.floww.finance;

import android.Manifest;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

@CapacitorPlugin(
    name = "SmsInbox",
    permissions = {
        @Permission(
            alias = "sms",
            strings = { Manifest.permission.READ_SMS }
        )
    }
)
public class SmsInboxPlugin extends Plugin {

    @PluginMethod
    public void checkPermission(PluginCall call) {
        boolean granted = getContext().checkSelfPermission(Manifest.permission.READ_SMS)
            == PackageManager.PERMISSION_GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.READ_SMS)
            == PackageManager.PERMISSION_GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        } else {
            requestPermissionForAlias("sms", call, "permissionCallback");
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        boolean granted = getPermissionState("sms") == com.getcapacitor.PermissionState.GRANTED;
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    /**
     * Read SMS inbox filtered by sender IDs and/or since timestamp.
     * Options:
     *  - senders: string[]  (match any — partial/case-insensitive)
     *  - sinceMs: long      (only SMS newer than this epoch ms)
     *  - limit: int         (max messages to return, default 500)
     */
    @PluginMethod
    public void readInbox(PluginCall call) {
        if (getContext().checkSelfPermission(Manifest.permission.READ_SMS)
            != PackageManager.PERMISSION_GRANTED) {
            call.reject("SMS permission not granted");
            return;
        }

        JSArray sendersArr = call.getArray("senders");
        long sinceMs = call.getLong("sinceMs", 0L);
        int limit = call.getInt("limit", 500);

        // Build sender filter (we'll do inexact match in Java since content provider
        // doesn't support case-insensitive LIKE portably)
        String[] senders = null;
        if (sendersArr != null && sendersArr.length() > 0) {
            try {
                senders = new String[sendersArr.length()];
                for (int i = 0; i < sendersArr.length(); i++) {
                    senders[i] = sendersArr.getString(i).toLowerCase();
                }
            } catch (JSONException e) {
                senders = null;
            }
        }

        JSArray messages = new JSArray();
        Cursor cursor = null;
        try {
            Uri uri = Uri.parse("content://sms/inbox");
            String[] projection = { "_id", "address", "body", "date" };
            String selection = sinceMs > 0 ? "date > ?" : null;
            String[] selectionArgs = sinceMs > 0 ? new String[]{ String.valueOf(sinceMs) } : null;
            String sortOrder = "date DESC LIMIT " + Math.max(1, Math.min(limit, 2000));

            cursor = getContext().getContentResolver().query(
                uri, projection, selection, selectionArgs, sortOrder
            );

            if (cursor != null) {
                int idxId = cursor.getColumnIndex("_id");
                int idxAddr = cursor.getColumnIndex("address");
                int idxBody = cursor.getColumnIndex("body");
                int idxDate = cursor.getColumnIndex("date");

                while (cursor.moveToNext()) {
                    String addr = idxAddr >= 0 ? cursor.getString(idxAddr) : "";
                    if (addr == null) addr = "";

                    // Filter by sender if specified
                    if (senders != null) {
                        String addrLower = addr.toLowerCase();
                        boolean match = false;
                        for (String s : senders) {
                            if (s != null && addrLower.contains(s)) {
                                match = true;
                                break;
                            }
                        }
                        if (!match) continue;
                    }

                    JSObject msg = new JSObject();
                    msg.put("id", idxId >= 0 ? cursor.getString(idxId) : "");
                    msg.put("address", addr);
                    msg.put("body", idxBody >= 0 ? cursor.getString(idxBody) : "");
                    msg.put("date", idxDate >= 0 ? cursor.getLong(idxDate) : 0L);
                    messages.put(msg);
                }
            }
        } catch (Exception e) {
            call.reject("Failed to read SMS: " + e.getMessage());
            return;
        } finally {
            if (cursor != null) cursor.close();
        }

        JSObject ret = new JSObject();
        ret.put("messages", messages);
        call.resolve(ret);
    }
}
