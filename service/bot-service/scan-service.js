import QrcodeTerminal from 'qrcode-terminal';
import { ScanStatus,log } from 'wechaty'
import request from "request"
import fs from 'fs'
import path from 'path'
// 配置文件
import config from "../../config/index.js"
const name = config.name
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
                
                //尝试读取本地缓存的botId，同时将原botId、当前botId及二维码链接推送到后台，通知重新扫码
                let file = config.localFile;
                let user = null;//注意：scan时没有user
                fs.readFile(file, function(err, data){syncBot(bot,user,data,qrcodeImageUrl)});             

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

/**
 * 提交登录机器人到后端进行同步
 * 参数包括：
 * oldBotId: 之前启动的botId。可以为空。如果则新建bot
 * botId: 当前botId
 * qrcodeUrl：二维码地址
 */
async function syncBot(bot,user,data,qrcodeImageUrl) {
    try{
        data = JSON.parse(data);
    }catch(err){
        console.log("failed parse local file content.");
    }    
    console.log("try to sync bot info. ",data,qrcodeImageUrl);
    let url = config.sx_api+'/wx/wxBot/rest/sync'
    request({
              url: url,
              method: 'POST',
              json:{
                    oldBotId:data&&data.botId?data.botId:"",
                    botId:bot.id,
                    status:"pending",//待扫码
                    qrcodeUrl:qrcodeImageUrl
                }
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("sync bot succeed.",body);
                  //let res = JSON.parse(body)
                } else {
                  console.log("sync bot error.",error)
                }
          })
}
