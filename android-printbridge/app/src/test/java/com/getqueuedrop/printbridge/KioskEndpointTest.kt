package com.getqueuedrop.printbridge
import org.junit.Assert.*
import org.junit.Test
class KioskEndpointTest {
    @Test fun productionHasExactOriginAndNoPathSuffix() {
        assertEquals("https://getqueuedrop.com/", KioskEndpoint.origin(false) + "/")
        assertEquals("https://getqueuedrop.com/kiosk/token", KioskEndpoint.origin(false) + "/kiosk/token")
    }
    @Test fun testBuildCannotReachProduction() {
        assertEquals("https://queuedrop-test.vercel.app", KioskEndpoint.origin(true))
        assertNotEquals(KioskEndpoint.origin(false), KioskEndpoint.origin(true))
    }
    @Test fun onlyDeviceTokensCanBecomeUrlPathSegments() {
        assertTrue(KioskEndpoint.validToken("00000000-0000-4000-8000-000000000001"))
        for (token in listOf("", "token/path", "https://getqueuedrop.com/", "../other", "00000000-0000-4000-8000-000000000001?x=1")) assertFalse(KioskEndpoint.validToken(token))
    }
}
