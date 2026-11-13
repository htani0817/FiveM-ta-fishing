fx_version 'cerulean'
game 'gta5'

name 'ta-fishing'
description 'Fishing with levels, five fish grades, a fisherman NPC shop, a fluctuating fish market and rankings'
author 'Tani'
version '2.0.0'

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js',
    'html/reel.js'
}

shared_scripts {
    '@ox_lib/init.lua',
    'config.lua',
    'shared.lua'
}

client_script 'client.lua'

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server.lua'
}

dependencies {
    'ox_lib',
    'ox_inventory',
    'ox_target',
    'oxmysql',
    'qbx_core'
}
