package com.getqueuedrop.printbridge

/** Compiled environment selection only; never use a user-entered or saved URL. */
object KioskEndpoint {
    private const val PRODUCTION_ORIGIN = "https://getqueuedrop.com"
    private const val TEST_ORIGIN = "https://queuedrop-test.vercel.app"
    fun origin(testOnly: Boolean): String = if (testOnly) TEST_ORIGIN else PRODUCTION_ORIGIN
    fun validToken(token: String): Boolean = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").matches(token)
}
