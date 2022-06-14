import request from "request"
// 配置文件
import config from "../../config/index.js"
const name = config.name

/**
 * @method onHeartbeat 获取机器人的心跳。
 * @param {*} user 
 */

export const onHeartbeat = bot => { 
	return async user => {
	    try {
	        console.log('========================onHeartbeat👇========================')
	        //console.log('获取机器人的心跳。bot.id='+bot.id)
	        //同步心跳检测时间
	        syncBotHeartbeat(bot,user)
	    } catch (error) {
	        console.log(`onHeartbeat：${error}`)
	    }

	}
}

/**
 * 提交登录机器人账号信息到后端进行同步
 * 此处仅同步状态即可
 */
async function syncBotHeartbeat(bot,user) {   
    console.log("try to sync bot heartbeat. ");
    let url = config.sx_api+'/wx/wxBot/rest/heartbeat'
    request({
              url: url,
              method: 'POST',
              json:{
                    botId:bot.id,
                    status:"active",//指定为活跃
                    heartBeat:new Date()
                }
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("sync bot heartbeat succeed.",body);
                  //let res = JSON.parse(body)
                } else {
                  console.log("sync bot heartbeat error.",error)
                }
          })
}