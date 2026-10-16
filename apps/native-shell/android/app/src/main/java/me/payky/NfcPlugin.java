package me.payky;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.Ndef;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reads the NDEF URI off a tapped tag — a Bolt Card's {@code lnurlw://} link
 * — and hands it to JS as a {@code tagRead} event.
 *
 * Reader mode rather than intent dispatch on purpose: while it is on, Android
 * does not route the tag to its own dispatcher, so tapping a card does not
 * pop a browser or an app chooser over the payment screen. Reader mode only
 * works while the activity is resumed, so it is dropped on pause and restored
 * on resume for as long as JS still wants to read.
 */
@CapacitorPlugin(name = "Nfc")
public class NfcPlugin extends Plugin {

    private boolean reading = false;

    @PluginMethod
    public void getStatus(PluginCall call) {
        NfcAdapter adapter = NfcAdapter.getDefaultAdapter(getContext());
        JSObject result = new JSObject();
        result.put(
                "status",
                adapter == null ? "unsupported" : adapter.isEnabled() ? "enabled" : "disabled"
        );
        call.resolve(result);
    }

    @PluginMethod
    public void startReading(PluginCall call) {
        reading = true;
        getActivity().runOnUiThread(this::enableReaderMode);
        call.resolve();
    }

    @PluginMethod
    public void stopReading(PluginCall call) {
        reading = false;
        getActivity().runOnUiThread(this::disableReaderMode);
        call.resolve();
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NFC_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @Override
    protected void handleOnResume() {
        if (reading) enableReaderMode();
    }

    @Override
    protected void handleOnPause() {
        disableReaderMode();
    }

    private void enableReaderMode() {
        Activity activity = getActivity();
        NfcAdapter adapter = NfcAdapter.getDefaultAdapter(activity);
        if (adapter == null || !adapter.isEnabled()) return;

        // Bolt Cards are NTAG 424 DNA, an ISO 14443-A tag.
        adapter.enableReaderMode(
                activity,
                this::onTagDiscovered,
                NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NFC_B,
                null
        );
    }

    private void disableReaderMode() {
        Activity activity = getActivity();
        NfcAdapter adapter = NfcAdapter.getDefaultAdapter(activity);
        if (adapter != null) adapter.disableReaderMode(activity);
    }

    private void onTagDiscovered(Tag tag) {
        JSObject event = new JSObject();
        event.put("uri", readUri(tag));
        notifyListeners("tagRead", event);
    }

    /** The first URI record of the tag's NDEF message, or null for any other tag. */
    private static String readUri(Tag tag) {
        Ndef ndef = Ndef.get(tag);
        if (ndef == null) return null;

        NdefMessage message = ndef.getCachedNdefMessage();
        if (message == null) return null;

        for (NdefRecord record : message.getRecords()) {
            Uri uri = record.toUri();
            if (uri != null) return uri.toString();
        }
        return null;
    }
}
