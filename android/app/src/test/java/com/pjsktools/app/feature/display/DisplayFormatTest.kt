package com.pjsktools.app.feature.display

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class DisplayFormatTest {
    @Test
    fun nullableNumbersKeepZeroDistinctFromUnavailable() {
        val prior = Locale.getDefault()
        Locale.setDefault(Locale.US)
        try {
            assertEquals("暂缺", displayCount(null))
            assertEquals("0", displayCount(0))
            assertEquals("12,345", displayCount(12_345))
            assertEquals("暂缺", displayDecimal(null))
            assertEquals("0", displayDecimal(0.0))
            assertEquals("12.50", displayDecimal(12.5))
        } finally {
            Locale.setDefault(prior)
        }
    }
}
