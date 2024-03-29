import fetch from 'node-fetch'
// node-request请求模块包
import request from "request"
// 配置文件
import config from "../config/index.js"

/**
 * Fetch response from xiaoli API
 * @param URL
 * @param postBody
 * @param okCallback: covert json to msg text when fetch succeeds
 * 返回结果：{success: true/false,data:jsonObject,msg:msg}
 */
export const fetchRemote  = async function fetchRemoteAPI(URL, postBody, okCallback, bot) {
    let resText = null
    try {
        let resp = await fetch(
            URL,
            {
                method: "POST",
                body: JSON.stringify(postBody), // put keywords and token in the body
            }
        )
        let resp_json = await resp.json()
        if (resp.success) {
            // status code = 200, we got it!
            resText = okCallback(bot, resp_json['data'])
        } else {
            // status code = 4XX/5XX, sth wrong with API
            resText = 'API ERROR: ' + resp_json['msg']
        }
    } catch (err) {
        resText = 'NETWORK ERROR: ' + err
    }
    return resText
}


//发送信息到运营群：运营团队收到新内容提示
//发送卡片：其链接为图片地址
export const sendWebHook = function (title,description,url,imgUrl){
    //推动图文内容到企业微信群，便于转发
    var msg = {
            "msgtype": "news",
            "news": {
               "articles" : [
                   {
                       "title" : title,
                       "description" : description,
                       "url" : url,
                       "picurl" : imgUrl
                   }
                ]
            }
        };

    //推送到企业微信
    console.log("\n===try to sent webhook msg. ===\n",msg);  
    return new Promise((resolve, reject) => {
        let url = config.wechat_cp_api+"/wework/ilife/notify-cp-company-broker"
        request({
              url: url,
              method: 'POST',
              json: msg
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("\n=== webhook message sent. ===\n",body);
                } else {
                  // do nothing
                }
          })
    })

}

//更新roomInfo
export const syncRoomInfo = function (room) {
    if(!room.payload || !room.payload.id || !room.payload.ownerId || !room.payload.topic || !room.payload.memberIdList || room.payload.memberIdList.length == 0){
        console.log("incomplete room info. ignore.");
        return;
    }
    var roomInfo = {
        gid: room.payload.id,
        owner: room.payload.ownerId,
        name: room.payload.topic,
        members: room.payload.memberIdList.length
    }

    if(room.brokerId){
        roomInfo.brokerId = room.brokerId;
    }
    //console.log("try to sync room info. ", room, roomInfo);
    return new Promise((resolve, reject) => {
        let url = config.sx_api+"/wx/wxGroup/rest/syncByGid"
        request({
              url: url,
              method: 'POST',
              json: roomInfo
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  //console.log("room info sync done.",body);
                  //let res = JSON.parse(body)
                  let res = body;
                  if(res.status){
                    //更新本地激活码，便于后续识别
                    console.log("room info sync done.");
                  }else{
                    // do nothing
                  }
                } else {
                  // do nothing
                }
          })
    })
}