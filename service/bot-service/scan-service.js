import QrcodeTerminal from 'qrcode-terminal';
import { ScanStatus,log } from 'wechaty'

/**
 * @method onScan 当机器人需要扫码登陆的时候会触发这个事件。 建议你安装 qrcode-terminal(运行 npm install qrcode-terminal) 这个包，这样你可以在命令行中直接看到二维码。
 * @param {*} qrcode 
 * @param {*} status 
 */

export const onScan = bot => {
    return async (qrcode, status) => {
        try {
            if (status === ScanStatus.Waiting) {
                console.log(`========================👉二维码链接👈========================\n\n`)
                const qrcodeImageUrl = [
                  'https://wechaty.js.org/qrcode/',
                  encodeURIComponent(qrcode),
                ].join('')
                log.info('bot.id='+bot.id)
                log.info('StarterBot', 'onScan: %s(%s) - %s', ScanStatus[status], status, qrcodeImageUrl)
                //注意：由于bot启动时尚未指定分配达人，未登录也不能知晓user信息，需要有运维人员手动从控制台复制二维码链接，并进入后台手动创建bot信息，并设置broker及qrcode。
                //后续达人将收到通知，能够扫码登录
                //在登录时将根据nickname自动补齐wechatyid
                console.log(`========================👉二维码状态：${status}👈========================\n\n`)
                QrcodeTerminal.generate(qrcode, {
                    small: true
                })
            }
        } catch (error) {
            console.log('onScan', error)
        }
    }
}

//module.exports = { onScan }