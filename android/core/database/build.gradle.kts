plugins {
    id("pjsk.android.library")
    id("pjsk.android.hilt")
    alias(libs.plugins.kotlin.serialization)
}
android { namespace = "com.pjsktools.core.database" }
ksp { arg("room.schemaLocation", "$projectDir/schemas") }
dependencies {
    implementation(project(":core:model"))
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    implementation(libs.kotlinx.serialization.json)
    ksp(libs.androidx.room.compiler)
    testImplementation(libs.junit)
    testImplementation(libs.androidx.room.testing)
}
