#!/usr/bin/env -S node --no-warnings --loader ts-node/esm
/**
 * Wechaty - Conversational RPA SDK for Chatbot Makers.
 *  - https://github.com/wechaty/wechaty
 */
// https://stackoverflow.com/a/42817956/1123955
// https://github.com/motdotla/dotenv/issues/89#issuecomment-587753552
import 'dotenv/config.js'

import {
  Contact,
  Message,
  ScanStatus,
  WechatyBuilder,
  log,
  UrlLink
}                  from 'wechaty'

import qrcodeTerminal from 'qrcode-terminal'

import { onScan } from  "../service/bot-service/scan-service.js"               // 当机器人需要扫码登陆的时候会触发这个事件。
import { onLogin } from "../service/bot-service/login-service.js"             // 当机器人成功登陆后，会触发事件，并会在事件中传递当前登陆机器人的信息
import { onLogout } from "../service/bot-service/logout-service.js"           // 当机器人检测到登出的时候，会触发事件，并会在事件中传递机器人的信息。
import { onReady } from "../service/bot-service/ready-service.js"             // 当所有数据加载完成后，会触发这个事件。在wechaty-puppet-padchat 中，它意味着已经加载完成Contact 和Room 的信息。
import { onMessage } from "../service/bot-service/message-service.js"         // 当机器人收到消息的时候会触发这个事件。
import { onRoomInvite } from "../service/bot-service/room-invite-service.js"  // 当收到群邀请的时候，会触发这个事件。
import { onRoomTopic } from "../service/bot-service/room-topic-service.js"    // 当有人修改群名称的时候会触发这个事件。
import { onRoomJoin } from "../service/bot-service/room-join-service.js"      // 当有人进入微信群的时候会触发这个事件。机器人主动进入某个微信群，那个样会触发这个事件。
import { onRoomleave } from "../service/bot-service/room-leave-service.js"    // 当机器人把群里某个用户移出群聊的时候会触发这个时间。用户主动退群是无法检测到的。
import { onFriendship } from "../service/bot-service/friendship-service.js"   // 当有人给机器人发好友请求的时候会触发这个事件。
import { onHeartbeat } from '../service/bot-service/heartbeat-service.js'     // 获取机器人的心跳。
import { onError } from '../service/bot-service/error-service.js'             // 当机器人内部出错的时候会触发error 事件。

import { wechatyToken } from '../config/index.js' // 机器人token

/**
function onScan (qrcode: string, status: ScanStatus) {
  if (status === ScanStatus.Waiting || status === ScanStatus.Timeout) {
    const qrcodeImageUrl = [
      'https://wechaty.js.org/qrcode/',
      encodeURIComponent(qrcode),
    ].join('')
    log.info('StarterBot', 'onScan: %s(%s) - %s', ScanStatus[status], status, qrcodeImageUrl)

    qrcodeTerminal.generate(qrcode, { small: true })  // show qrcode on console

  } else {
    log.info('StarterBot', 'onScan: %s(%s)', ScanStatus[status], status)
  }
}

function onLogin (user: Contact) {
  log.info('StarterBot', '%s login', user)
}

function onLogout (user: Contact) {
  log.info('StarterBot', '%s logout', user)
}

async function onMessage (msg: Message) {
  log.info('StarterBot', msg.toString())

  if (msg.text() === 'ding') {
    await msg.say('dong')
  }
}
//**/


const bot = WechatyBuilder.build({
  name: 'little-happiness-bot',
  puppet: 'wechaty-puppet-wechat'
  /**
   * How to set Wechaty Puppet Provider:
   *
   *  1. Specify a `puppet` option when instantiating Wechaty. (like `{ puppet: 'wechaty-puppet-whatsapp' }`, see below)
   *  1. Set the `WECHATY_PUPPET` environment variable to the puppet NPM module name. (like `wechaty-puppet-whatsapp`)
   *
   * You can use the following providers locally:
   *  - wechaty-puppet-wechat (web protocol, no token required)
   *  - wechaty-puppet-whatsapp (web protocol, no token required)
   *  - wechaty-puppet-padlocal (pad protocol, token required)
   *  - etc. see: <https://wechaty.js.org/docs/puppet-providers/>
   */
  // puppet: 'wechaty-puppet-whatsapp'

  /**
   * You can use wechaty puppet provider 'wechaty-puppet-service'
   *   which can connect to remote Wechaty Puppet Services
   *   for using more powerful protocol.
   * Learn more about services (and TOKEN) from https://wechaty.js.org/docs/puppet-services/
   */
  // puppet: 'wechaty-puppet-service'
  // puppetOptions: {
  //   token: 'xxx',
  // }
})

bot.on('scan',    onScan(bot))
bot.on('login',   onLogin(bot))
bot.on('logout',  onLogout(bot))
bot.on('message', onMessage(bot))
bot.on('ready', onReady)
bot.on('room-invite', onRoomInvite)
bot.on('room-topic', onRoomTopic) 
bot.on('room-join', onRoomJoin)
bot.on('room-leave', onRoomleave)
bot.on('friendship', onFriendship)
bot.on('heartbeat', onHeartbeat(bot))
bot.on('error', onError)

bot.start()
  .then(() => log.info('StarterBot', 'Starter Bot Started.'))
  .catch(e => log.error('StarterBot', e))




