buildscript {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
  dependencies {
    classpath("com.android.tools.build:gradle:8.13.2")
    classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.21")
    classpath("org.jlleitschuh.gradle:ktlint-gradle:14.2.0")
  }
}

allprojects {
  repositories {
    google()
    mavenCentral()
  }
}

// ktlint は自プロジェクトの app モジュールのみに適用する
// Tauri が自動生成する generated/ ディレクトリは対象外とする
project(":app") {
  apply(plugin = "org.jlleitschuh.gradle.ktlint")
  configure<org.jlleitschuh.gradle.ktlint.KtlintExtension> {
    filter {
      exclude("**/generated/**")
    }
  }
}

tasks.register("clean").configure {
  delete("build")
}