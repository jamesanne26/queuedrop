package com.getqueuedrop.printbridge

import org.junit.Assert.*
import org.junit.Test
import kotlinx.coroutines.runBlocking
import java.util.concurrent.CancellationException

class PrintSafetyTest {
    @Test fun cancelledBetweenRetriesStopsWithoutPrintingAgain() = runBlocking {
        var calls = 0; var active = true
        try {
            PrintSafety.retry(guard = { if (!active) throw PrintClaimStopped("Cancelled") },
                print = { calls++; throw IllegalStateException("Disconnected") }, pause = { active = false })
            fail("Expected cancellation")
        } catch (_: PrintClaimStopped) { assertEquals(1, calls) }
    }
    @Test fun uncertainTransferDoesNotRetryOrFallback() = runBlocking {
        var calls = 0; var fallback = 0; var delays = 0
        try {
            PrintSafety.retry(guard = {}, print = {
                PrintSafety.fallback(primary = { calls++; throw PrintTransferUncertain("Partial receipt") },
                    secondary = { fallback++; "USB" })
            }, pause = { delays++ })
            fail("Expected uncertain")
        } catch (_: PrintTransferUncertain) {
            assertEquals(1, calls); assertEquals(0, fallback); assertEquals(0, delays)
        }
    }
    @Test fun coroutineCancellationPropagates() = runBlocking {
        var delays = 0
        try { PrintSafety.retry(guard = {}, print = { throw CancellationException("Stopped") }, pause = { delays++ }); fail("Expected cancellation") }
        catch (_: CancellationException) { assertEquals(0, delays) }
    }
    @Test fun validationFailureFailsClosed() = runBlocking {
        var calls = 0
        try { PrintSafety.retry(guard = { throw PrintClaimStopped("Network unavailable") }, print = { calls++ }, pause = {}); fail("Expected stop") }
        catch (_: PrintClaimStopped) { assertEquals(0, calls) }
    }
    @Test fun disconnectedPrinterHasBoundedRetries() = runBlocking {
        var calls = 0; var guards = 0; var delays = 0
        try { PrintSafety.retry(guard = { guards++ }, print = { calls++; throw IllegalStateException("Disconnected") }, pause = { delays++ }); fail("Expected failure") }
        catch (_: IllegalStateException) { assertEquals(5, calls); assertEquals(5, guards); assertEquals(4, delays) }
    }
    @Test fun successfulTransferIsNotRetried() = runBlocking {
        var calls = 0
        assertEquals("Printed", PrintSafety.retry(guard = {}, print = { calls++; "Printed" }, pause = { fail("No retry") }))
        assertEquals(1, calls)
    }
    @Test fun preTransferConnectionFailureMayUseUsb() {
        assertEquals("USB", PrintSafety.fallback(primary = { throw IllegalStateException("No Bluetooth") }, secondary = { "USB" }))
    }
    @Test fun cancellationDuringConnectStopsBeforeFirstWrite() {
        var writes = 0; var usb = 0
        try {
            PrintSafety.fallback(primary = { val guard = { throw PrintClaimStopped("Cancelled during connect") }; guard(); writes++; "Bluetooth" },
                secondary = { usb++; "USB" }); fail("Expected stop")
        } catch (_: PrintClaimStopped) { assertEquals(0, writes); assertEquals(0, usb) }
    }
}
