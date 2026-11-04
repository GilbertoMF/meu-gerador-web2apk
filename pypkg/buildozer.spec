[app]
title = App simples
package.name = appsimples
package.domain = com.chatlivre
source.dir = .
source.include_exts = py,png,jpg,kv,atlas,json,txt
version = 1.0
requirements = python3,kivy
orientation = portrait
fullscreen = 0
android.api = 33
android.minapi = 21
android.ndk_api = 21
android.accept_sdk_license = True
android.permissions = INTERNET
android.archs = arm64-v8a, armeabi-v7a
p4a.bootstrap = sdl2
icon.filename = %(source.dir)s/icon.png
