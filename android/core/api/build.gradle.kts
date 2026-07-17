plugins {
    id("pjsk.kotlin.library")
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    jvmToolchain(17)
    sourceSets.named("main") { kotlin.srcDir("generated/src/main/kotlin") }
}

dependencies {
    api(libs.retrofit.core) {
        exclude(group = "com.squareup.okhttp3", module = "okhttp")
    }
    api(libs.okhttp.core)
    implementation(libs.kotlinx.serialization.json)
}
