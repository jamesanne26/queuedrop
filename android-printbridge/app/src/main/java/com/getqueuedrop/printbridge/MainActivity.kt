package com.getqueuedrop.printbridge

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.app.PendingIntent
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import android.content.*
import android.content.pm.PackageManager
import android.hardware.usb.*
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.math.min

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var setupPanel: View
    private lateinit var baseUrlInput: EditText
    private lateinit var tokenInput: EditText
    private lateinit var statusText: TextView
    private lateinit var cancelSettingsButton: Button
    private lateinit var printerText: TextView
    private lateinit var printBanner: TextView

    private val prefs by lazy { getSharedPreferences("queuedrop_bridge", MODE_PRIVATE) }
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    private var pollJob: Job? = null
    private val usbPermissionAction = "com.getqueuedrop.printbridge.USB_PERMISSION"
    private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private val bluetoothPermissionRequest = 4102

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == usbPermissionAction) {
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                status(if (granted) "USB printer permission granted." else "USB printer permission denied.")
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        setupPanel = findViewById(R.id.setupPanel)
        baseUrlInput = findViewById(R.id.baseUrl)
        tokenInput = findViewById(R.id.deviceToken)
        statusText = findViewById(R.id.statusText)
        cancelSettingsButton = findViewById(R.id.cancelSettings)
        printerText = findViewById(R.id.printerText)
        printBanner = findViewById(R.id.printBanner)

        registerReceiver(usbReceiver, IntentFilter(usbPermissionAction), RECEIVER_NOT_EXPORTED)
        configureWebView()
        requestBluetoothPermissionsIfNeeded()

        baseUrlInput.setText(prefs.getString("baseUrl", "") ?: "")
        tokenInput.setText(prefs.getString("deviceToken", "") ?: "")
        refreshPrinterLabel()

        findViewById<Button>(R.id.selectPrinter).setOnClickListener { selectBluetoothPrinter() }
        findViewById<Button>(R.id.testPrinter).setOnClickListener { lifecycleScope.launch { runTestPrint() } }
        findViewById<Button>(R.id.openKiosk).setOnClickListener { saveSettingsAndOpen() }

        cancelSettingsButton.setOnClickListener {
            val base = prefs.getString("baseUrl", "") ?: ""
            val token = prefs.getString("deviceToken", "") ?: ""
            if (base.isNotBlank() && token.isNotBlank()) openKiosk(base, token)
        }

        val base = prefs.getString("baseUrl", "") ?: ""
        val token = prefs.getString("deviceToken", "") ?: ""
        if (base.isNotBlank() && token.isNotBlank()) openKiosk(base, token) else showSetup()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
    }

    private fun openKiosk(base: String, token: String) {
        setupPanel.visibility = View.GONE
        webView.visibility = View.VISIBLE
        webView.loadUrl("$base/kiosk/$token?t=${System.currentTimeMillis()}")
        hideSystemUi()
        showBanner("Printer ready • waiting for stub", false, 2200)
        startPolling(base, token)
    }

    private fun showSetup() {
        pollJob?.cancel()
        baseUrlInput.setText("")
        tokenInput.setText("")
        webView.visibility = View.GONE
        setupPanel.visibility = View.VISIBLE
        refreshPrinterLabel()

        val hasSavedConfig = !prefs.getString("baseUrl", "").isNullOrBlank() &&
            !prefs.getString("deviceToken", "").isNullOrBlank()
        cancelSettingsButton.visibility = if (hasSavedConfig) View.VISIBLE else View.GONE
        status(if (hasSavedConfig)
            "This tablet is already configured. Printer selection can be changed without replacing the terminal settings."
        else
            "Choose a paired thermal printer, enter the QueueDrop URL and terminal token, then save.")
    }

    private fun saveSettingsAndOpen() {
        val base = baseUrlInput.text.toString().trim().trimEnd('/')
        val token = tokenInput.text.toString().trim()
        if (!base.startsWith("https://") || token.isBlank()) {
            status("Enter a valid HTTPS QueueDrop Website URL and Terminal Device Token.")
            return
        }
        if (BuildConfig.TEST_ONLY && base != "https://queuedrop-test.vercel.app") {
            status("This TEST APK requires https://queuedrop-test.vercel.app")
            return
        }
        prefs.edit().putString("baseUrl", base).putString("deviceToken", token).apply()
        baseUrlInput.setText("")
        tokenInput.setText("")
        openKiosk(base, token)
    }

    private fun startPolling(base: String, token: String) {
        pollJob?.cancel()
        pollJob = lifecycleScope.launch {
            while (isActive) {
                try {
                    claimAndPrint(base, token)
                } catch (e: CancellationException) { throw e
                } catch (e: Exception) {
                    showBanner("Print Bridge: ${shortError(e)}", true, 3500)
                }
                delay(1200)
            }
        }
    }

    private suspend fun claimAndPrint(base: String, token: String) = withContext(Dispatchers.IO) {
        val request = Request.Builder().url("$base/api/print-bridge/$token/jobs").get().build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return@withContext
            val root = JSONObject(response.body.string())
            if (root.isNull("job")) return@withContext
            val job = root.getJSONObject("job")
            val jobId = job.optString("id", job.optString("job_id", job.optString("jobId")))
            if (jobId.isBlank()) return@withContext
            val payload = job.optJSONObject("payload") ?: JSONObject()
            val generation = job.optInt("generation", 0)
            val claimAttempt = job.getInt("attempt")
            val receiptKey = "$jobId:$generation"
            val guard = {
                if (!isActive) throw CancellationException("Printing stopped")
                validatePrintClaim(base, token, jobId, generation, claimAttempt)
            }
            val display = payload.optString("displayNumber", "stub")

            // If this exact job was already transmitted successfully on this device but the server ACK
            // was interrupted, do not print it twice. Re-send only the ACK.
            if (wasPrintedLocally(receiptKey) || (generation == 0 && wasPrintedLocally(jobId))) {
                acknowledge(base, token, jobId, true, null, generation, claimAttempt)
                showBanner("$display already printed ✓", false, 1800)
                return@withContext
            }

            try {
                val result = PrintSafety.retry(
                    guard = guard,
                    print = { printBestAvailable(payload, guard) },
                    pause = { attempt ->
                        showBanner("Printer retry ${attempt + 1}/5", true, 0)
                        delay((700L * attempt).coerceAtMost(2500L))
                    }
                )
                markPrintedLocally(receiptKey)
                try {
                    acknowledge(base, token, jobId, true, null, generation, claimAttempt)
                } catch (cancelled: CancellationException) { throw cancelled
                } catch (_: Exception) {
                    showBanner("$display PRINTED • server ACK will retry", false, 5000)
                    return@withContext
                }
                showBanner("$display PRINTED • ${result.transport}", false, 5000)
            } catch (cancelled: CancellationException) { throw cancelled
            } catch (inactive: PrintClaimStopped) {
                showBanner("$display stopped • ${shortError(inactive)}", true, 5000)
            } catch (uncertain: PrintTransferUncertain) {
                // Never repeat a transfer after any receipt bytes may have reached the printer.
                try { acknowledge(base, token, jobId, false, shortError(uncertain), generation, claimAttempt, true) }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { /* stale claim recovery also stops automatic retries */ }
                showBanner("CHECK PRINTER • automatic retry stopped • $display", true, 8000)
            } catch (failure: Exception) {
                acknowledge(base, token, jobId, false, shortError(failure), generation, claimAttempt)
                showBanner("PRINT FAILED • ${shortError(failure)}", true, 8000)
            }
        }
    }

    private data class PrintResult(val transport: String)

    private fun printBestAvailable(payload: JSONObject, guard: () -> Unit = {}): PrintResult =
        PrintSafety.fallback(
            primary = {
                val device = chooseBluetoothPrinter() ?: throw IllegalStateException("No paired Bluetooth printer")
                printBluetooth(device, payload, guard)
                PrintResult("Bluetooth ${safeName(device)}")
            },
            secondary = { printUsb(payload, guard); PrintResult("USB") }
        )

    @SuppressLint("MissingPermission")
    private fun printBluetooth(device: BluetoothDevice, payload: JSONObject, guard: () -> Unit) {
        ensureBluetoothPermission()
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: throw IllegalStateException("Bluetooth not supported")
        if (!adapter.isEnabled) throw IllegalStateException("Bluetooth is off")
        adapter.cancelDiscovery()
        val bytes = buildReceipt(payload)

        var socket: BluetoothSocket? = null
        var transferStarted = false
        try {
            socket = connectSpp(device)
            val out = socket.outputStream
            guard()
            var offset = 0
            while (offset < bytes.size) {
                val len = min(1024, bytes.size - offset)
                transferStarted = true
                out.write(bytes, offset, len)
                out.flush()
                offset += len
                if (bytes.size > 2048) SystemClock.sleep(15)
            }
            // Give compact printers time to drain their internal buffer before closing RFCOMM.
            SystemClock.sleep(450)

            // Best-effort ESC/POS status query. Many clones do not return status; lack of a
            // response is not treated as failure because a successful RFCOMM write+flush is
            // still the most portable confirmation available across low-cost printers.
            try {
                out.write(byteArrayOf(0x10, 0x04, 0x04)) // DLE EOT 4, paper sensor status
                out.flush()
                SystemClock.sleep(120)
                val input = socket.inputStream
                if (input.available() > 0) {
                    val paperStatus = input.read()
                    if (paperStatus >= 0 && (paperStatus and 0x60) != 0) {
                        throw IllegalStateException("Printer reports paper out")
                    }
                }
            } catch (e: IllegalStateException) {
                throw e
            } catch (_: Throwable) {
                // Status query is optional on generic ESC/POS printers.
            }
        } catch (e: CancellationException) { throw e
        } catch (e: Exception) {
            if (transferStarted) throw PrintTransferUncertain("Bluetooth transfer may have printed; check paper", e)
            throw e
        } finally {
            try { socket?.close() } catch (_: Throwable) {}
        }
    }

    @SuppressLint("MissingPermission")
    private fun connectSpp(device: BluetoothDevice): BluetoothSocket {
        var firstError: Throwable? = null
        try {
            val socket = device.createRfcommSocketToServiceRecord(sppUuid)
            socket.connect()
            return socket
        } catch (t: Throwable) {
            firstError = t
        }

        // Compatibility fallback used by several older/low-cost Classic Bluetooth ESC/POS printers.
        try {
            val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
            val socket = method.invoke(device, 1) as BluetoothSocket
            socket.connect()
            return socket
        } catch (t: Throwable) {
            throw IOException(t.message ?: firstError?.message ?: "Unable to connect using SPP")
        }
    }

    private fun acknowledge(base: String, token: String, jobId: String, success: Boolean, error: String?, generation: Int, attempt: Int, uncertain: Boolean = false) {
        val json = JSONObject().put("jobId", jobId).put("success", success).put("error", error).put("generation", generation).put("attempt", attempt).put("uncertain", uncertain)
        val body = json.toString().toRequestBody("application/json".toMediaType())
        val req = Request.Builder().url("$base/api/print-bridge/$token/jobs").patch(body).build()
        client.newCall(req).execute().use { response ->
            if (!response.isSuccessful) throw IOException("Print acknowledgement failed (${response.code})")
        }
    }

    private fun validatePrintClaim(base: String, token: String, jobId: String, generation: Int, attempt: Int) {
        val url = "$base/api/print-bridge/$token/jobs?jobId=$jobId&generation=$generation&attempt=$attempt"
        try {
            client.newCall(Request.Builder().url(url).get().build()).execute().use { response ->
                if (!response.isSuccessful || !JSONObject(response.body?.string() ?: "{}").optBoolean("allowed"))
                    throw PrintClaimStopped("Ticket cancelled, expired, or claim changed")
            }
        } catch (e: PrintClaimStopped) { throw e
        } catch (e: Exception) { throw PrintClaimStopped("Cannot confirm ticket status; printing stopped", e) }
    }

    private fun markPrintedLocally(jobId: String) {
        val set = prefs.getStringSet("printedJobIds", emptySet())?.toMutableSet() ?: mutableSetOf()
        set += jobId
        // Keep the local de-duplication cache bounded.
        while (set.size > 200) set.remove(set.first())
        if (!prefs.edit().putStringSet("printedJobIds", set).commit()) throw PrintTransferUncertain("Printed receipt could not be saved locally")
    }

    private fun wasPrintedLocally(jobId: String): Boolean =
        prefs.getStringSet("printedJobIds", emptySet())?.contains(jobId) == true

    @SuppressLint("MissingPermission")
    private fun chooseBluetoothPrinter(): BluetoothDevice? {
        ensureBluetoothPermission()
        val adapter = BluetoothAdapter.getDefaultAdapter() ?: return null
        if (!adapter.isEnabled) throw IllegalStateException("Bluetooth is off")
        val bonded = adapter.bondedDevices?.toList().orEmpty()
        if (bonded.isEmpty()) return null

        val preferred = prefs.getString("printerAddress", null)
        bonded.firstOrNull { it.address.equals(preferred, true) }?.let { return it }

        val likely = bonded.sortedByDescending { printerScore(safeName(it)) }
            .firstOrNull { printerScore(safeName(it)) > 0 }
        if (likely != null) return likely
        return if (bonded.size == 1) bonded.first() else null
    }

    @SuppressLint("MissingPermission")
    private fun selectBluetoothPrinter() {
        try {
            ensureBluetoothPermission()
            val adapter = BluetoothAdapter.getDefaultAdapter()
            if (adapter == null) {
                status("This Android device does not support Bluetooth.")
                return
            }
            if (!adapter.isEnabled) {
                status("Turn on Bluetooth first, then pair the thermal printer in Android Settings.")
                return
            }
            val devices = adapter.bondedDevices?.sortedBy { safeName(it).lowercase() }.orEmpty()
            if (devices.isEmpty()) {
                status("No paired Bluetooth devices. Pair the thermal printer in Android Settings first.")
                return
            }
            val labels = devices.map { "${safeName(it)}\n${it.address}" }.toTypedArray()
            AlertDialog.Builder(this)
                .setTitle("Select thermal printer")
                .setItems(labels) { _, which ->
                    val d = devices[which]
                    prefs.edit().putString("printerAddress", d.address).putString("printerName", safeName(d)).apply()
                    refreshPrinterLabel()
                    status("Selected ${safeName(d)}. Tap TEST PRINT to verify it.")
                }
                .setNegativeButton("Cancel", null)
                .show()
        } catch (e: Exception) {
            status(shortError(e))
        }
    }

    private suspend fun runTestPrint() = withContext(Dispatchers.IO) {
        try {
            showBanner("Sending test print…", false, 0)
            val payload = JSONObject()
                .put("businessName", "QueueDrop")
                .put("branchName", "Printer Test")
                .put("serviceName", "Thermal Printer")
                .put("displayNumber", "TEST")
                .put("position", 1)
                .put("footer", "If you can read this, QueueDrop printing is ready.")
            val result = printBestAvailable(payload)
            showBanner("TEST PRINTED ✓ • ${result.transport}", false, 5000)
            status("Test print sent successfully using ${result.transport}.")
        } catch (e: Throwable) {
            val msg = shortError(e)
            showBanner("TEST PRINT FAILED • $msg", true, 7000)
            status(msg)
        }
    }

    private fun printUsb(payload: JSONObject, guard: () -> Unit) {
        val manager = getSystemService(USB_SERVICE) as UsbManager
        val devices = manager.deviceList.values.toList()
        if (devices.isEmpty()) throw IllegalStateException("No USB printer detected")

        val device = devices.firstOrNull { d ->
            (0 until d.interfaceCount).any { idx ->
                val i = d.getInterface(idx)
                i.interfaceClass == UsbConstants.USB_CLASS_PRINTER ||
                    (0 until i.endpointCount).any { ep -> i.getEndpoint(ep).direction == UsbConstants.USB_DIR_OUT }
            }
        } ?: throw IllegalStateException("No printable USB device detected")

        if (!manager.hasPermission(device)) {
            val pi = PendingIntent.getBroadcast(this, 0, Intent(usbPermissionAction), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            manager.requestPermission(device, pi)
            throw IllegalStateException("Allow USB printer access, then QueueDrop will retry")
        }

        val intf = (0 until device.interfaceCount).map { device.getInterface(it) }
            .firstOrNull { it.interfaceClass == UsbConstants.USB_CLASS_PRINTER }
            ?: (0 until device.interfaceCount).map { device.getInterface(it) }
                .firstOrNull { i -> (0 until i.endpointCount).any { i.getEndpoint(it).direction == UsbConstants.USB_DIR_OUT } }
            ?: throw IllegalStateException("No printable USB interface found")

        val endpoint = (0 until intf.endpointCount).map { intf.getEndpoint(it) }
            .firstOrNull { it.direction == UsbConstants.USB_DIR_OUT }
            ?: throw IllegalStateException("No USB OUT endpoint")

        val conn = manager.openDevice(device) ?: throw IllegalStateException("Cannot open USB printer")
        var transferStarted = false
        try {
            if (!conn.claimInterface(intf, true)) throw IllegalStateException("Cannot claim USB printer")
            val bytes = buildReceipt(payload)
            guard()
            var offset = 0
            while (offset < bytes.size) {
                val len = min(4096, bytes.size - offset)
                transferStarted = true
                val sent = conn.bulkTransfer(endpoint, bytes, offset, len, 5000)
                if (sent <= 0) throw IllegalStateException("USB print transfer failed")
                offset += sent
            }
        } catch (e: CancellationException) { throw e
        } catch (e: Exception) {
            if (transferStarted) throw PrintTransferUncertain("USB transfer may have printed; check paper", e)
            throw e
        } finally {
            try { conn.releaseInterface(intf) } catch (_: Exception) {}
            conn.close()
        }
    }

    private fun buildReceipt(p: JSONObject): ByteArray {
        val out = ByteArrayOutputStream()
        fun raw(vararg b: Int) = b.forEach { out.write(it) }
        fun line(s: String = "") { out.write((s + "\n").toByteArray(Charsets.US_ASCII)) }

        raw(0x1B, 0x40)
        raw(0x1B, 0x61, 0x01)
        raw(0x1B, 0x45, 0x01)
        line(p.optString("businessName", "QueueDrop"))
        raw(0x1B, 0x45, 0x00)
        line(p.optString("branchName", ""))
        line()
        line(p.optString("serviceName", ""))
        raw(0x1D, 0x21, 0x22)
        raw(0x1B, 0x45, 0x01)
        line(p.optString("displayNumber", ""))
        raw(0x1D, 0x21, 0x00)
        raw(0x1B, 0x45, 0x00)
        val pos = p.optInt("position", 0)
        if (pos > 0) line("Position: $pos")
        line()

        val qr = p.optString("qrData", "")
        if (qr.isNotBlank()) {
            out.write(qrRaster(qr, 240))
            line()
            line("Scan QR to check your queue")
        }
        line()
        val footer = p.optString("footer", "")
        if (footer.isNotBlank()) wrap58(footer).forEach(::line)
        line(); line(); line()
        // Do not send a paper-cut command by default: most portable 58mm printers (including
        // PT-210 class devices) have a tear bar rather than an auto-cutter.
        return out.toByteArray()
    }

    private fun wrap58(text: String, width: Int = 32): List<String> {
        val words = text.split(Regex("\\s+"))
        val lines = mutableListOf<String>()
        var cur = ""
        for (w in words) {
            if (cur.isEmpty()) cur = w
            else if (cur.length + 1 + w.length <= width) cur += " $w"
            else { lines += cur; cur = w }
        }
        if (cur.isNotEmpty()) lines += cur
        return lines
    }

    private fun qrRaster(text: String, size: Int): ByteArray {
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size)
        val widthBytes = (size + 7) / 8
        val data = ByteArray(widthBytes * size)
        for (y in 0 until size) for (x in 0 until size) if (matrix[x, y]) {
            val i = y * widthBytes + x / 8
            data[i] = (data[i].toInt() or (0x80 shr (x % 8))).toByte()
        }
        val out = ByteArrayOutputStream()
        out.write(byteArrayOf(
            0x1D, 0x76, 0x30, 0x00,
            (widthBytes and 0xFF).toByte(), ((widthBytes shr 8) and 0xFF).toByte(),
            (size and 0xFF).toByte(), ((size shr 8) and 0xFF).toByte()
        ))
        out.write(data)
        return out.toByteArray()
    }

    private fun printerScore(name: String): Int {
        val n = name.lowercase()
        var score = 0
        listOf("pt210", "pt-210", "goojprt", "thermal", "printer", "pos", "rpp", "xprinter", "receipt").forEach {
            if (n.contains(it)) score += 10
        }
        return score
    }

    @SuppressLint("MissingPermission")
    private fun safeName(device: BluetoothDevice): String = try { device.name ?: "Bluetooth printer" } catch (_: Throwable) { "Bluetooth printer" }

    private fun refreshPrinterLabel() {
        val name = prefs.getString("printerName", null)
        val addr = prefs.getString("printerAddress", null)
        printerText.text = if (!name.isNullOrBlank()) "Selected printer: $name${if (!addr.isNullOrBlank()) "  •  $addr" else ""}"
        else "Printer: Auto-detect paired ESC/POS printer (Bluetooth first, USB fallback)"
    }

    private fun requestBluetoothPermissionsIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val needed = listOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
                .filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
            if (needed.isNotEmpty()) ActivityCompat.requestPermissions(this, needed.toTypedArray(), bluetoothPermissionRequest)
        }
    }

    private fun ensureBluetoothPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
            runOnUiThread { requestBluetoothPermissionsIfNeeded() }
            throw IllegalStateException("Allow Nearby devices/Bluetooth permission")
        }
    }

    private fun shortError(t: Throwable): String {
        val msg = t.message?.replace('\n', ' ')?.trim().orEmpty()
        return if (msg.isBlank()) t.javaClass.simpleName else msg.take(180)
    }

    private fun status(msg: String) = runOnUiThread { statusText.text = msg }

    private fun showBanner(msg: String, isError: Boolean, hideAfterMs: Long) = runOnUiThread {
        printBanner.text = msg
        printBanner.setBackgroundColor(if (isError) 0xE6B91C1C.toInt() else 0xE60F766E.toInt())
        printBanner.visibility = View.VISIBLE
        printBanner.bringToFront()
        printBanner.removeCallbacks(hideBannerRunnable)
        if (hideAfterMs > 0) printBanner.postDelayed(hideBannerRunnable, hideAfterMs)
    }

    private val hideBannerRunnable = Runnable { if (::printBanner.isInitialized) printBanner.visibility = View.GONE }

    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { showSetup() }

    override fun onDestroy() {
        pollJob?.cancel()
        unregisterReceiver(usbReceiver)
        super.onDestroy()
    }
}
