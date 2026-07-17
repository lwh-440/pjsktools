plugins { id("pjsk.android.library") }
android { namespace = "com.pjsktools.core.model" }
dependencies { implementation(libs.kotlinx.coroutines.android); testImplementation(libs.junit) }
