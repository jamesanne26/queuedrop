package com.getqueuedrop.printbridge

import java.util.concurrent.CancellationException

class PrintClaimStopped(message: String, cause: Throwable? = null) : Exception(message, cause)
class PrintTransferUncertain(message: String, cause: Throwable? = null) : Exception(message, cause)

object PrintSafety {
    private fun stop(error: Exception) = error is CancellationException || error is PrintClaimStopped || error is PrintTransferUncertain
    suspend fun <T> retry(guard: () -> Unit, print: () -> T, pause: suspend (Int) -> Unit): T {
        for (attempt in 1..5) {
            guard() // fail closed if server validation is unavailable
            try { return print() }
            catch (error: Exception) {
                if (stop(error) || attempt == 5) throw error
                pause(attempt)
            }
        }
        error("Unreachable")
    }
    fun <T> fallback(primary: () -> T, secondary: () -> T): T = try { primary() }
    catch (error: Exception) { if (stop(error)) throw error; secondary() }
}
