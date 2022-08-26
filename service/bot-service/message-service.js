
import { log } from 'wechaty'
// node-request请求模块包
import request from "request"
// 请求参数解码
import urlencode from "urlencode"
import { FileBox }  from 'file-box'
import schedule from 'node-schedule'
import md5 from "md5"
import crypto from "crypto"
import fs from 'fs'
import path from 'path'
// 配置文件
import config from "../../config/index.js"
// 同步群聊
import { syncRoomInfo,sendWebHook } from "../../src/common.js"

// 机器人名字
const name = config.name
// 管理群组列表
const roomList = config.room.roomList

// 消息监听回调
export const onMessage = bot => {
  return async function onMessage(msg) {
    // 判断消息来自自己，仅响应激活码
    if (msg.self()){
        if(msg.room() && config.magicCode && config.magicCode.trim().length>0 && config.magicCode.split("__").indexOf(msg.text()) >-1 /*&& msg.text() === config.magicCode */ ){
          console.log("got magic code. activate wx group.");
          const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>

          //把room加入本地列表
          config.room.roomList[topic]=msg.room().id;
          //把room提交到后端，等待设置客群及自动任务
          const room = await msg.room()
          syncRoom(topic, room);
          //TODO 重新schedule所有任务：在停止群托管、激活群托管、修改任务规则等均可以发送激活码重新装载任务
        }else{
          //do nothing
          //console.log("自说自话，且不是激活码，直接忽略");
        }      
    }

    //仅处理文本消息
    if (msg.type() == bot.Message.Type.Text) {//打印到控制台
      //console.log("=============New  Message================")
      console.log(`msg : ${msg}`)
      /**
      console.log(
        `from id: ${msg.talker() ? msg.talker().name() : null}: ${msg.talker() ? msg.talker().id : null
        }`
      )    
      console.log(`to: ${msg.listener()}`)
      console.log(`text: ${msg.text()}`)
      console.log(`room: ${msg.room()}`)
      //**/
      //console.log("=============End of New Message================")      
    }else{
      //console.log("非文本消息，忽略.")
      return;
    }

    // 仅处理托管群聊的消息
    let roomListName = Object.keys(roomList);//获取托管群名称列表
    if (msg.room()) {//是群聊：需要判断是否是托管群
      // 获取群聊
      const room = await msg.room()
      // 获取群聊名称
      //const topic = await room.topic();
      const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>

      if(roomListName.indexOf(topic)>-1){
        // 收到消息，提到自己
        if (await msg.mentionSelf()) {//仅处理提到自己的消息
          let sendText = "";
          try{//尝试获取自己的名字
            // 获取提到自己的名字
            let self = await msg.listener() // 注意在padlocal下 self为undefined
            self = "@" + self.name()
            // 获取消息内容，拿到整个消息文本，去掉 @+名字
            sendText = msg.text().replace(self, "").replace("找", "").replace("查", "").replace("#", "")
          }catch(err){//如果没有就直接判断关键字
            let keywords = msg.text().split("找")
            if(keywords && keywords.length>1 && keywords[1].trim().length>2 && keywords[1].trim().length<20)
              sendText = keywords[1];
          }

          if(sendText.trim().length==0)//没有关键字不做任何处理
            return;

          // 请求机器人接口回复
          let res = await requestRobot(bot,sendText,room)

          // 返回消息，并@来自人: 当前不予处理，由人工自行处理
          room.say(res, msg.talker())
          return
        }else{//根据关键字识别：需要严格判断
          if (msg.text() === 'ding') {
            await msg.say('dong dong',msg.talker())
          }else if (msg.text() === '最新文章' || msg.text() === '文章列表' || msg.text() === '文章阅读' || msg.text() === '置顶文章' || msg.text() === '置顶列表') {//置顶文章列表：推送链接即可
            sendToppingRead(msg);
          }else if (msg.text() === '互阅发车' || msg.text() === '互阅开车' || msg.text() === '互阅车' || msg.text() === '文章接龙') {//互月发车：推送链接即可
            let res = sendGroupRead(msg);
            await msg.say(res,msg.talker())
          }else if (msg.text() === '互关发车' || msg.text() === '互关开车' || msg.text() === '互关车') {//互关发车：推送链接即可
            let res = sendGroupSubscribe(msg);
            await msg.say(res,msg.talker())
          }else if(config.rooms[topic] && config.rooms[topic].grouping.code && config.rooms[topic].grouping.timeFrom){//如果有互阅开车会话，则响应报数。需要严格匹配格式
            const regex = /^[a-zA-Z]\s?\d+/;//报数格式必须是： A 1 2 3 4 5 
            if(regex.test(msg.text())){//是报数，则予以响应
              var boxName = msg.text().match(/[a-zA-Z]{1}/g)[0].toUpperCase();//匹配得到分箱
              var readCounts = msg.text().match(/\d+/g);//匹配得到所有报数
              console.log("got numbers.",boxName, readCounts);
              if(config.rooms[topic].grouping.articles[boxName] && config.rooms[topic].grouping.articles[boxName].length>0 && 
                readCounts.length>0 && config.rooms[topic].grouping.articles[boxName].length == readCounts.length ){
                checkBrokerByNickname(msg,config.rooms[topic].grouping.articles[boxName],readCounts);
              }else if(config.rooms[topic].grouping.articles[boxName] && config.rooms[topic].grouping.articles[boxName].length>0 && 
                readCounts.length>0 && config.rooms[topic].grouping.articles[boxName].length != readCounts.length ){ //只有部分数据,提示补全
                room.say("报数与文章数不匹配。车厢"+boxName +"共有"+config.rooms[topic].grouping.articles[boxName].length+"篇文章，但报数为" +readCounts.length+"组", msg.talker())
              }else if(!config.rooms[topic].grouping.articles[boxName] ){ //车厢号错误
                room.say("车厢号错误。需要按照车厢报数，如：A 11 22 33 44 55", msg.talker())
              }else{
                //do nothing
                room.say("请检查输入，需要包含车厢号及报数，并用空格分隔。如：A 11 22 33 44 55", msg.talker())
              }
            }else if(msg.text().trim().indexOf("http:")==0 || msg.text().trim().indexOf("https:")==0){ //支持直接发布URL，仅一行url 
              if(isUrlValid(msg.text())){ //支持开车中动态发布文章
                console.log("add new article to grouping.",msg.text());
                checkBrokerByNicknameForPublishArticle(msg,room, msg.text().trim());
              }else{//其他地址不支持
                room.say("仅支持公众号文章链接，其他不支持哦，链接前后后也不要有其他文字或换行~~", msg.talker())
              }
            }
          }else if (msg.text() === '互阅' || msg.text() === '互关' || msg.text() === '互' || isUrlValid(msg.text()) || 
                    ((msg.text().indexOf("@")>-1 || msg.text().indexOf("艾特")>-1  || msg.text().indexOf("AT")>-1) && (msg.text().indexOf("必回")>-1 || msg.text().indexOf("我")>-1 )) || 
                    ((msg.text().indexOf("互关")>-1 || msg.text().indexOf("互阅")>-1 ) && (msg.text().indexOf("必回")>-1 || msg.text().indexOf("秒回")>-1 )) || 
                    msg.text().indexOf("诚信互")>-1 ) {//推送列表链接
            if(config.rooms[topic] && (new Date().getTime() - config.rooms[topic].autoReplyTimestamp > config.groupingDuration) ){ //当前群内自动回复时间超过时间间隔
              try{
                  let dailyUrl = new bot.UrlLink({
                    description: '10秒阅读要求，还可以开白转载',
                    thumbnailUrl: 'https://www.biglistoflittlethings.com/static/logo/grouping/default.png',
                    title: '文章或公众号发进列表，阅读关注更方便',
                    url: 'https://www.biglistoflittlethings.com/ilife-web-wx/publisher/articles.html',
                  });
                  msg.say(dailyUrl, msg.talker())

                  //发送一条提示语：随机获取
                  let randomIndex = Math.floor(Math.random()* config.tips.length);
                  let dailyText = config.tips[randomIndex];//"群里阅读少，加入列表可以让更多人看到哦~~";
                  msg.say(dailyText, msg.talker())

                  //更新时间戳
                  config.rooms[topic].autoReplyTimestamp = new Date().getTime();
              }catch(err){
                console.log("error while send url",err);
              } 
            }
          }else if (msg.text().startsWith('找') && msg.text().length<20 ) {
            let sendText = msg.text().replace("找", "").replace("查", "").replace("#", "")
            let res = await requestRobot(bot,sendText,room, null)
            msg.say(res, msg.talker())
          }          
        }
      }else{//非托管群仅响应。当前不做响应。对于共享群的情况，可以响应激活码
        console.log("非托管群消息，仅响应查询及开车消息");
        if (msg.text() === '互阅发车' || msg.text() === '互阅开车' || msg.text() === '互阅车') {//互月发车：推送链接即可
          let res = sendGroupRead(msg);
          await msg.say(res,msg.talker())
        }else if (msg.text() === '互关发车' || msg.text() === '互关开车' || msg.text() === '互关车') {//互关发车：推送链接即可
          let res = sendGroupSubscribe(msg);
          await msg.say(res,msg.talker())
        }/*else if (msg.text().startsWith('找') && msg.text().length<10 ) {
          let sendText = msg.text().replace("找", "").replace("查", "").replace("#", "")
          let res = await requestRobot(sendText,room, null)
          msg.say(res, msg.talker())
        }*/else if(config.rooms[topic] && config.rooms[topic].grouping.code && config.rooms[topic].grouping.timeFrom){//如果有互阅开车会话，则响应报数。需要严格匹配格式
          const regex = /^\s?[a-zA-Z]\s+\d+/;//报数格式必须是： A 1 2 3 4 5 
          if(regex.test(msg.text())){//是报数，则予以响应
            var boxName = msg.text().match(/[a-zA-Z]{1}/g)[0].toUpperCase();//匹配得到分箱
            var readCounts = msg.text().match(/\d+/g);//匹配得到所有报数
            console.log("got numbers.",boxName, readCounts);
            if(config.rooms[topic].grouping.articles[boxName] && config.rooms[topic].grouping.articles[boxName].length>0 && 
              readCounts.length>0 && config.rooms[topic].grouping.articles[boxName].length == readCounts.length ){
              checkBrokerByNickname(msg,config.rooms[topic].grouping.articles[boxName],readCounts);
            }else if(config.rooms[topic].grouping.articles[boxName] && config.rooms[topic].grouping.articles[boxName].length>0 && 
              readCounts.length>0 && config.rooms[topic].grouping.articles[boxName].length != readCounts.length ){ //只有部分数据,提示补全
              room.say("报数与文章数不匹配。车厢"+boxName +"共有"+config.rooms[topic].grouping.articles[boxName].length+"篇文章，但报数为" +readCounts.length+"组", msg.talker())
            }else if(!config.rooms[topic].grouping.articles[boxName] ){ //车厢号错误
              room.say("车厢号错误。需要按照车厢报数，如：A 11 22 33 44 55", msg.talker())
            }else{
              //do nothing
              room.say("请检查输入，需要包含车厢号及报数，并用空格分隔。如：A 11 22 33 44 55", msg.talker())
            }
          }
        }        
        /**
        if(msg.room() && config.magicCode && config.magicCode.trim().length>0 && msg.text() === config.magicCode){
          console.log("got magic code. activate wx group.");
          //把room加入本地列表
          config.room.roomList[topic]=msg.room().id;
          //把room提交到后端，等待设置客群及自动任务
          syncRoom(topic, msg.room().id);
          //TODO 重新schedule所有任务：在停止群托管、激活群托管、修改任务规则等均可以发送激活码重新装载任务
        }else{
          console.log("非托管群消息，且不是激活码，直接忽略");
        }
        //**/
      }

    }else{//一对一单聊：直接关键字回复
      if (msg.text() === 'ding') {
        await msg.say('dong',msg.talker())
      } 
      if (msg.text().startsWith('找') && msg.text().length<20 ) {
        let sendText = msg.text().replace("找", "").replace("查", "").replace("#", "")
        let res = await requestRobot(bot,sendText,null,msg)
        msg.say(res, msg.talker())
      }              
      /**
      // 回复信息是关键字 “加群”
      if (await isAddRoom(msg)) return

      // 回复信息是所管理的群聊名
      if (await isRoomName(bot, msg)) return

      // 请求机器人聊天接口
      let res = await requestRobot(msg.text())
      // 返回聊天接口内容
      await msg.say(res)
      //**/
    }

  }
}

/**
 * send message 群聊
 * 无结果返回提示信息
 */
async function sendMessage2Room(room, text, imgUrl) {
    console.log('Sending message to room ' + room)
    //发送图片
    try{
      let imageMsg = FileBox.fromUrl(imgUrl)
      root.say(imageMsg) 
      //发送文字
      room.say(text)
    }catch(err){
      console.log("error while send msg 2 room",err);
    }  
}

/**
 * send message 单聊
 * 无结果返回提示信息
 */
async function sendMessage2Person(msg, text, imgUrl) {
    console.log('Sending message to person ' +msg)
    //发送图片
    try{
      let imageMsg = FileBox.fromUrl(imgUrl)
      msg.say(imageMsg,msg.talker()) 
      //发送文字
      msg.say(text,msg.talker())
    }catch(err){
      console.log("error while send msg 2 person",err);
    }    
}

/**
 * send image to room
 */
async function sendImage2Room(room, imgUrl) {
    console.log('Sending msg to room ' + room)
    //发送图片
    try{
      let imageMsg = FileBox.fromUrl(imgUrl)
      room.say(imageMsg) 
    }catch(err){
      console.log("error while send image 2 room",err);
    }
}

/**
 * send image to person
 */
async function sendImage2Person(msg, imgUrl) {
    console.log('Sending msg to person ' + msg)
    //发送图片
    try{
      let imageMsg = FileBox.fromUrl(imgUrl)
      msg.say(imageMsg, msg.talker())       
    }catch(err){
      console.log("error while send image 2 person",err);
    }

}

/**
 * send url info to room
   URLInfo:
    {
      description: description,
      thumbnailUrl: thumbnailUrl,
      title: title,
      url: url,
    }
 */
async function sendUrl2Room(bot, room, urlInfo) {
    console.log('Sending url info to room ' + room, urlInfo)
    //发送图片
    try{
      let urlLink = new bot.UrlLink(urlInfo);
      const member = await room.member({name: config.broker.nickname}) //需要确认是否在群里，如果不在就不能发
      if(member){
        room.say(urlLink)    
      }else{
        console.log("bot not in target room. skipped.");
      }      
    }catch(err){
      console.log("failed send url info 2 room",err)
    }

}

/**
 * @description 回复信息是关键字 “加群” 处理函数
 * @param {Object} msg 消息对象
 * @return {Promise} true-是 false-不是
 */
async function isAddRoom(msg) {
  // 关键字 加群 处理
  if (msg.text() == "加群") {
    let roomListName = Object.keys(roomList)
    let info = `${name}当前管理群聊有${roomListName.length}个，回复群聊名即可加入哦\n\n`
    roomListName.map(v => {
      info += "【" + v + "】" + "\n"
    })
    msg.say(info)
    return true
  }
  return false
}

/**
 * @description 回复信息是所管理的群聊名 处理函数
 * @param {Object} bot 实例对象
 * @param {Object} msg 消息对象
 * @return {Promise} true-是群聊 false-不是群聊
 */
async function isRoomName(bot, msg) {
  // 回复信息为管理的群聊名
  if (Object.keys(roomList).some(v => v == msg.text())) {
    // 通过群聊id获取到该群聊实例
    const room = await bot.Room.find({ id: roomList[msg.text()] })

    // 判断是否在房间中 在-提示并结束
    if (await room.has(msg.from())) {
      await msg.say("您已经在房间中了")
      return true
    }

    // 发送群邀请
    await room.add(msg.from())
    await msg.say("已发送群邀请")
    return true
  }
  return false
}

/**
 * @description 机器人请求接口 处理函数
 * @param {String} keywords 发送文字
 * @return {Promise} 相应内容
 */
function requestRobot(bot,keywords, room, msg) {
  console.log("try search. [keywords]",keywords);
  return new Promise((resolve, reject) => {
    let url = config.es_api
    //**
    let postBody = {
                        "from":0,
                        "size":1,
                        /**
                        "query": {
                            "match_all": {}
                        },
                        //**/
                      "query": {
                        "bool": {
                          "must_not": [{
                              "exists": { "field" : "status.inactive" }
                          }]
                        }
                      },                        
                        "sort": [
                          {"_script": {
                                "script": "Math.random()",
                                "type": "number",
                                "order": "asc"
                              }
                          },                          
                          { "_score":   { "order": "desc" }},
                          { "@timestamp": { "order": "desc" }}
                        ]
                    }
    if(keywords && keywords.trim().length>0 && keywords.trim()!='*'){
        postBody = {
                      "from":0,
                      "size":1,   
                      /**   
                      "query": {
                        "query_string": {
                          "query": keywords,
                          "default_field": "full_text"
                        }
                      },
                      //**/
                      "query": {
                        "bool": {
                          "should": [{
                            "match": {
                              "full_text": keywords
                            }
                          }],
                          "must_not": [{
                              "exists": { "field" : "status.inactive" }
                          }]
                        }
                      },                        
                      "sort": [
                        {"_script": {
                              "script": "Math.random()",
                              "type": "number",
                              "order": "asc"
                            }
                        },                      
                        { "_score":   { "order": "desc" }},
                        { "@timestamp": { "order": "desc" }}
                      ]
                    }      
    }

    request({
              url: url,
              method: 'POST',
              json: postBody
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("got search result.",body);
                  //let res = JSON.parse(body)
                  let res = body;
                  if (res.hits && res.hits.total>0 && res.hits.hits && res.hits.hits.length>0) {
                    //随机组织1-3条，组成一条返回
                    let total = 1;//Math.floor(Math.random() * 3);//取1-4条随机
                    let send = "亲，找到 🎁"+keywords+"👇";//res.data.reply
                    let urlInfo = {}; //组织URL卡片发送
                    for (let i = 0; i < res.hits.hits.length && i<total; i++) {
                      var item  = res.hits.hits[i]._source;
                      let text = item.distributor.name+" "+(item.price.currency?item.price.currency:"￥")+item.price.sale+" "+item.title;
                      //let url =  item.link.token?item.link.token:(item.link.wap2?item.link.wap2:item.link.wap);

                      let fromBroker = "system";//TODO 需要替换为当前达人
                      try{
                        const roomTopic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>
                        fromBroker = config.rooms[roomTopic].fromBroker;
                      }catch(err){
                        console.log("failed find fromBroker by current room.",room);
                      }
                      let fromUser = "bot";//固定为机器人
                      let channel = "wechat";

                      let url =  config.sx_wx_api+"/go.html?id="+item._key+"&fromBroker="+fromBroker+"&fromUser="+fromUser+"&from="+channel;//TODO需要添加 fromBroker信息

                      let logo = item.logo?item.logo: item.images[0]
                      let moreUrl =  config.sx_wx_api+"/index.html?keywords="+encodeURIComponent(keywords);

                      //获得短网址：单个item地址
                      let eventId = crypto.randomUUID();
                      let itemKey = item._key;

                      let shortCode = generateShortCode(url);
                      saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,url,shortCode);
                      //let url_short = config.sx_wx_api +"/s.html?s="+shortCode;
                      let url_short = config.sx_wx_api2 + shortCode;

                      //获得短网址：更多items地址
                      eventId = crypto.randomUUID();
                      itemKey = "page_"+eventId
                      shortCode = generateShortCode(moreUrl);
                      saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,moreUrl,shortCode);
                      //let moreUrl_short = config.sx_wx_api +"/s.html?s="+shortCode;
                      let moreUrl_short = config.sx_wx_api2 + shortCode;

                      //send += "\n"+text +" "+url_short;

                      send += "\n" + item.distributor.name+" "+item.title; // 标题
                      if(item.price.bid && item.price.bid>item.price.sale)send += "\n❌ 原价 " + item.price.bid+(item.price.currency?(config.currency[item.price.currency]?config.currency[item.price.currency]:(" "+item.price.currency)):""); // 原价
                      //if(item.price.coupon && item.price.coupon>0)send += "【券】" + item.price.coupon; // 优惠券
                      send += "\n✅ 售价 " + item.price.sale+(item.price.currency?(config.currency[item.price.currency]?config.currency[item.price.currency]:(" "+item.price.currency)):"");
                      if(item.link.token && item.link.token.trim().length >0){
                        send += "\n👉 复制 "+item.link.token +" 并打开 "+item.distributor.name;
                      }else{
                        send += "\n立即前往👉 " + url_short;
                      }

                      send += "\n\n👀更多请看👉"+moreUrl_short;
                      
                      urlInfo.title = item.title;
                      urlInfo.description = item.distributor.name + (item.tagging?item.tagging:"") +" "+ (item.tags?item.tags.join(" "):"");
                      urlInfo.thumbnailUrl = item.logo?item.logo.replace(/\.avif/,""):item.images[0].replace(/\.avif/,"");
                      urlInfo.url = url_short;

                      //推送图片及文字消息
                      if(room && isImage(logo))sendImage2Room(room, logo);
                      if(msg && isImage(logo))sendImage2Person(msg, logo);

                      //推送评价结果：仅推送客观评价指标及客观评价结果
                      if(item.media){
                        let mediaKeys = [];
                        if(item.media.measure)mediaKeys.push("measure");
                        if(item.media["measure-scheme"])mediaKeys.push("measure-scheme");
                        if(mediaKeys.length==0){
                          //do nothing
                        }else if(mediaKeys.length==1){//仅有一个就直接发送
                          if(room)sendImage2Room(room, item.media[mediaKeys[0]]);
                          if(msg)sendImage2Person(msg, item.media[mediaKeys[0]]);                           
                        }else{//否则随机发送
                          let r = Math.floor(Math.random() * 100) % mediaKeys.length; //生成随机数
                          if(room)sendImage2Room(room, item.media[mediaKeys[r]]);
                          if(msg)sendImage2Person(msg, item.media[mediaKeys[r]]); 
                        }                       
                      }

                      //推荐语
                      if(item.advice){
                        let adviceKeys = Object.keys(item.advice);
                        if(adviceKeys.length==0){
                          //do nothing
                        }else if(adviceKeys.length==1){//仅有一个就直接发送
                          if(room)room.say(item.advice[adviceKeys[0]]);
                          if(msg)msg.say(item.advice[adviceKeys[0]],msg.talker());                           
                        }else{//否则随机发送
                          let r = Math.floor(Math.random() * 100) % adviceKeys.length; //生成随机数
                          if(room)room.say(item.advice[adviceKeys[r]]);
                          if(msg)msg.say(item.advice[adviceKeys[r]],msg.talker());  
                        }                       
                      }                      

                    }

                    //随机发送URL卡片或文字：当前未启用
                    //sendUrl2Room(bot, room, urlInfo);                    

                    // 免费的接口，所以需要把机器人名字替换成为自己设置的机器人名字
                    send = send.replace(/Smile/g, name)
                    resolve(send)
                  } else {
                    if (res.code == 1010) {
                      resolve("众里寻TA千百度，可我还是没找着~~")
                    } else {
                      resolve("小可急走追黄蝶，飞入菜花无处寻~~")
                    }
                  }
                } else {
                  resolve("去年残腊，曾折梅花相对插。是我驽钝，空有花开无处寻。换个词试试呢~~")
                }
          })
  })
}

//返回互阅列表：直接发送文字及链接
function sendGroupRead(msg){
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>
  //需要检查是否有尚未结束互阅车
  if(config.rooms[topic] && config.rooms[topic].grouping && config.rooms[topic].grouping.timeFrom && config.rooms[topic].grouping.duration ){
    var waitMillis = new Date().getTime() - (config.rooms[topic].grouping.timeFrom.getTime()+config.rooms[topic].grouping.duration);
    if( waitMillis < 0 ){
      return "当前车次尚未结束，请加入或"+(Math.floor(-1*waitMillis/1000/60))+"分钟后开始";
    }
  }
  //需要检查时间离下一个整点是否足够
  /**
  var next = new Date();
  next.setHours(next.getHours()+1);
  next.setMinutes(0);
  next.setSeconds(0);
  var spareMillis = next.getTime()-new Date().getTime();
  if(spareMillis<6*60*1000 && spareMillis>0){
    return "请稍等，"+Math.floor(spareMillis/1000/60)+"分钟后开始";
  }
  //**/

  var now = new Date();

  //将链接保存为短链
  let eventId = crypto.randomUUID();
  let itemKey = "page_"+eventId;
  let fromBroker = "system";//TODO 需要替换为当前达人
  let fromUser = "bot";//固定为机器人
  let channel = "wechat";
  //生成code
  var groupingCode = generateShortCode(eventId);
  //起止时间
  var timeFrom = now.getTime();
  var timeTo = timeFrom + 60*60*1000;//1小时有效
  let url =  config.sx_wx_api+"/publisher/articles-grouping.html?code="+groupingCode+"&timeFrom="+timeFrom+"&timeTo="+timeTo+"&groupingName="+(now.getHours()+"点"+now.getMinutes()+"分列表");
  let shortCode = generateShortCode(url);
  saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,url,shortCode);  

  //设置本地互阅会话
  if(!config.rooms[topic])config.rooms[topic]=JSON.parse(JSON.stringify(config.groupingTemplate));//根据grouping模板设置
  config.rooms[topic].grouping.timeFrom = new Date();
  config.rooms[topic].grouping.duration = 10*60*1000;
  config.rooms[topic].grouping.code = groupingCode;
  config.rooms[topic].grouping.page = 0;
  config.rooms[topic].grouping.articles = {};
  config.rooms[topic].grouping.name = now.getHours()+"点"+now.getMinutes()+"分合集";

  //设置任务，2分钟后发送列表
  setTimeout(function(){
    requestGroupingArticles(msg);
  },config.rooms[topic].grouping.timeout);

  //直接返回文字信息即可
  var txt = "📣阅读开始，发链接加入，每人一篇，2分钟出合集\n"+config.sx_wx_api2 +shortCode;
  return txt;
}

//根据grouping code分页加载文章列表，最多发4车
function requestGroupingArticles(msg) {
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>  
  console.log("try request grouping articles. [groupingCode]",config.rooms[topic].grouping.code);
  return new Promise((resolve, reject) => {
    let url = config.sx_api+"/wx/wxArticle/rest/grouping-articles?from=0&to=20&openid=&publisherOpenid=&code="+config.rooms[topic].grouping.code
    //**
    let postBody = {
                      "from":0,
                      "to":20, //需要列表进行控制，不能超过20条，此处默认为25条 
                      "code":config.rooms[topic].grouping.code,
                      "openid": "",//ignore
                      "publisherOpenid":""//ignore
                    }
    request({
              url: url,
              method: 'GET',
              //json: postBody
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("got search result.",body);
                  let res = JSON.parse(body)
                  //let res = body;
                  if (res && res.length>0) {
                    let sendtxt = "🚩本轮共"+(Math.floor((res.length+config.rooms[topic].grouping.pageSize-1)/config.rooms[topic].grouping.pageSize))+"合集，请阅读，__howlong分钟后汇总结果。报数格式为\nA 11 22 33 44 55";//res.data.reply
                    //按照pageSize分箱
                    var boxIndex = 0;
                    for (let i = 0; i < res.length; i++) {//按照pageSize分箱
                      boxIndex = Math.floor(i/config.rooms[topic].grouping.pageSize);
                      if(!config.rooms[topic].grouping.articles[config.rooms[topic].grouping.names[boxIndex]]){
                        config.rooms[topic].grouping.articles[config.rooms[topic].grouping.names[boxIndex]] = [];//空白列表
                      }
                      var sublist = config.rooms[topic].grouping.articles[config.rooms[topic].grouping.names[boxIndex]];
                      sublist.push(res[i]);
                      console.log("assemble box "+boxIndex,sublist);
                      config.rooms[topic].grouping.articles[config.rooms[topic].grouping.names[boxIndex]] = sublist;
                    }
                    // 逐节推送
                    for(let k=0;k<config.rooms[topic].grouping.names.length&&k<=boxIndex;k++){
                      let boxMsg = "📍合集："+config.rooms[topic].grouping.names[k];
                      let articles = config.rooms[topic].grouping.articles[config.rooms[topic].grouping.names[k]];
                      console.log("got box "+k,articles);
                      for(let j=0;j<articles.length;j++){
                        boxMsg+="\n"+config.numbers[j]+articles[j].title;
                        boxMsg+="\n👉"+articles[j].url;
                      }
                      msg.say(boxMsg, msg.talker());
                    }

                    //发送报数提示
                    //sendtxt = sendtxt.replace(/__howlong/,Math.floor(res.length*15/60)>0?(""+Math.floor(res.length*15/60)):"1");
                    sendtxt = sendtxt.replace(/__howlong/,"5");
                    msg.say(sendtxt, msg.talker());

                    //设置定时任务推送报告链接，默认按照timeout设置发送
                    setTimeout(function(){
                      sendGroupReport(msg);
                    }, /*  5*60*1000  config.rooms[topic].grouping.timeout*3  */ res.length<4 ? 1*60*1000 : res.length*15*1000);                    

                    // 免费的接口，所以需要把机器人名字替换成为自己设置的机器人名字
                    sendtxt = sendtxt.replace(/Smile/g, name)
                    resolve(sendtxt)
                  } else {
                    config.rooms[topic]=JSON.parse(JSON.stringify(config.groupingTemplate));//取消grouping，恢复默认grouping模板设置
                    //msg.say("⛔文章过少，车次取消，召集10-20人就可以发送 互阅发车 再次开始哦~~", msg.talker());
                    resolve("⛔文章过少，车次取消，召集10-20人就可以发送 互阅发车 再次开始哦~~")
                  }
                } else {
                  config.rooms[topic]=JSON.parse(JSON.stringify(config.groupingTemplate));//取消grouping，恢复默认grouping模板设置
                  msg.say("啊哦，出合集遇到问题，请直接进入列表阅读~~", msg.talker());
                  resolve("啊哦，出合集遇到问题，请直接进入列表阅读~~")
                }
          })
  })
}


//推送互阅报告：直接发送文字及链接
function sendGroupReport(msg){
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>
  //需要检查是否有尚未结束互阅车，如果没有就直接结束
  if(!config.rooms[topic] || !config.rooms[topic].grouping || !config.rooms[topic].grouping.code){
    return;
  }

  var now = new Date();

  //将链接保存为短链
  let eventId = crypto.randomUUID();
  let itemKey = "page_"+eventId;
  let fromBroker = "system";//TODO 需要替换为当前达人
  let fromUser = "bot";//固定为机器人
  let channel = "wechat";

  let url =  config.sx_wx_api+"/publisher/report-grouping.html?code="+config.rooms[topic].grouping.code+"&groupingName="+config.rooms[topic].grouping.name;
  let shortCode = generateShortCode(url);
  saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,url,shortCode);  

  //清空本地缓存：暂时不清空，避免推送报告后不能在群里报数
  //config.rooms[topic]=JSON.parse(JSON.stringify(config.groupingTemplate));//根据grouping模板设置
  setTimeout(function(){ //延迟5分钟关闭本次开车
    config.rooms[topic]=JSON.parse(JSON.stringify(config.groupingTemplate));//根据grouping模板设置
  }, 2*60*1000);    

  //查询得到本次开车结果并直接展示
  let res = requestGroupingResult(shortCode, msg)
  /**
  try{
    if(res && res.length>0)
        msg.say(res, msg.talker());
  }catch(err){
    console.log("failed send topping articles.",err);
  }
  //**/
}


//返回置顶互阅列表：直接发送文字及链接
function requestGroupingResult(shortCode, msg){  
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>  
  console.log("try request grouping result. [groupingCode]",config.rooms[topic].grouping.code);

  //默认返回列表结果
  var txt = "📈点击查看明细并补漏👇\n"+config.sx_wx_api2+shortCode;

  return new Promise((resolve, reject) => {
    let url = config.sx_api+"/wx/wxGrouping/rest/groupingResult/"+config.rooms[topic].grouping.code+"/20" //仅获取25条
    request({
              url: url,
              method: 'GET'
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("got grouping result.",body);
                  let res = JSON.parse(body)
                  //let res = body;
                  console.log("got grouping result.",res);
                  if (res && res.length>0) { //返回结果为一个列表
                    let sendtxt = "🏁报告来咯，本轮结束~~";//res.data.reply
                    for (let i = 0; i < res.length; i++) { //逐条组装：文章序号 文章标题 达人昵称 阅读数 回阅数
                      sendtxt += "\n";
                      sendtxt += ((i<config.numbers.length)?config.numbers[i]:(i+1))+" ";
                      sendtxt += res[i].title;
                      //sendtxt += " 🉐️"+(res[i].gotCounts + res[i].gotCounts2)

                      sendtxt += "\n👉"+res[i].nickname;
                      //sendtxt += " 👀"+(res[i].paidCounts + res[i].paidCounts2)
                      //sendtxt += " 新增"+res[i].gotCounts
                      //sendtxt += "回"+res[i].paidCounts
                      sendtxt += " 📥"+(res[i].gotCounts + res[i].gotCounts2)
                      sendtxt += "📤"+(res[i].paidCounts + res[i].paidCounts2)
                      
                      if(res[i].paidCounts + res[i].paidCounts2 - (res[i].gotCounts + res[i].gotCounts2) < 0 ){
                        sendtxt += "☹️";
                      }else if(res[i].paidCounts + res[i].paidCounts2 - (res[i].gotCounts + res[i].gotCounts2) > 0){
                        //sendtxt += "❤️‍🩹";
                      }else{
                        //sendtxt += " ❤️";
                      }
                      if(res[i].points < 0 ){
                        sendtxt += "⛽";
                      }                      
                    }
                    
                    sendtxt += "\n\n" + txt;

                    // 免费的接口，所以需要把机器人名字替换成为自己设置的机器人名字
                    sendtxt = sendtxt.replace(/Smile/g, name)

                    msg.say(sendtxt, msg.talker());
                    //resolve(sendtxt)

                  } else {
                    console.log("no grouping results found.");
                    //resolve(txt)
                    msg.say(txt, msg.talker());
                  }
                } else {
                  console.log("error occured while get grouping results.");
                  //resolve(txt);
                  msg.say(txt, msg.talker());
                }
          })
  })
}

//返回置顶文章列表：直接发送文字及链接
function sendToppingRead(msg){
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>  
  console.log('Sending topping read msg to room ' + topic)   

  //需要检查是否有尚未结束互阅车
  if(config.rooms[topic]&&config.rooms[topic].grouping && config.rooms[topic].grouping.timeFrom && config.rooms[topic].grouping.duration ){
    var waitMillis = new Date().getTime() - (config.rooms[topic].grouping.timeFrom.getTime()+config.rooms[topic].grouping.duration);
    if( waitMillis < 0 ){
      // return "当前车次尚未结束，请加入或"+(Math.floor(-1*waitMillis/1000/60))+"分钟后开始";
      msg.say("当前车次尚未结束，请加入👆，或"+(Math.floor(-1*waitMillis/1000/60))+"分钟后开始", msg.talker());
      return;
    }
  }
  //需要检查时间离下一个整点是否足够
  var next = new Date();
  next.setHours(next.getHours()+1);
  next.setMinutes(0);
  next.setSeconds(0);
  var spareMillis = next.getTime()-new Date().getTime();
  if(spareMillis<6*60*1000 && spareMillis>0){
    // return "请稍等，"+Math.floor(spareMillis/1000/60)+"分钟后开始";
    msg.say("请稍等，"+Math.floor(spareMillis/1000/60)+"分钟后开始", msg.talker());
    return;
  }

    let res = requstToppingRead(msg)
    try{
      if(res && res.length>0)
          msg.say(res, msg.talker());
    }catch(err){
      console.log("failed send topping articles.",err);
    }
}

//返回置顶互阅列表：直接发送文字及链接
function requstToppingRead(msg){  
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>  

  var now = new Date();

  //将链接保存为短链
  let eventId = crypto.randomUUID();
  let itemKey = "page_"+eventId;
  let fromBroker = "system";//TODO 需要替换为当前达人
  let fromUser = "bot";//固定为机器人
  let channel = "wechat";
  //生成code
  var groupingCode = generateShortCode(eventId);//报数时需要，注意此时code仅用于topping，在后端无对应的组队阅读
  //起止时间
  /**
  var timeFrom = now.getTime();
  var timeTo = timeFrom + 60*60*1000;//1小时有效
  let url =  config.sx_wx_api+"/publisher/articles-grouping.html?code="+groupingCode+"&timeFrom="+timeFrom+"&timeTo="+timeTo+"&groupingName="+(now.getHours()+"点"+now.getMinutes()+"分置顶列表");
  let shortCode = generateShortCode(url);
  saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,url,shortCode);  
  //**/

  //设置本地互阅会话
  if(!config.rooms[topic])config.rooms[topic]=JSON.parse(JSON.stringify(config.groupingTemplate));//根据grouping模板设置
  config.rooms[topic].grouping.timeFrom = new Date();
  config.rooms[topic].grouping.duration = 10*60*1000;
  config.rooms[topic].grouping.code = groupingCode;
  config.rooms[topic].grouping.page = 0;
  config.rooms[topic].grouping.articles = {};
  config.rooms[topic].grouping.name = now.getHours()+"点"+now.getMinutes()+"分置顶列表";

 console.log("try request topping articles. [groupingCode]",config.rooms[topic].grouping.code);
  return new Promise((resolve, reject) => {
    //let url = config.sx_api+"/wx/wxArticle/rest/topping-articles?from=0&to=5&openid=&publisherOpenid=" //仅获取5条
    let url = config.sx_api+"/wx/wxArticle/rest/pending-articles?from=0&to=5&openid=&publisherOpenid=" //仅获取5条
    request({
              url: url,
              method: 'GET'
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("got search result.",body);
                  let res = JSON.parse(body)
                  //let res = body;
                  if (res && res.length>0) {
                    let sendtxt = "共"+(Math.floor((res.length+config.rooms[topic].grouping.pageSize-1)/config.rooms[topic].grouping.pageSize))+"节，请逐节阅读报数，格式为：\nA 11 22 33 44 55";//res.data.reply
                    //按照pageSize分箱
                    var boxIndex = 0;
                    for (let i = 0; i < res.length; i++) {//按照pageSize分箱
                      boxIndex = Math.floor(i/config.rooms[topic].grouping.pageSize);
                      if(!config.rooms[topic].grouping.articles[config.rooms[topic].grouping.names[boxIndex]]){
                        config.rooms[topic].grouping.articles[config.rooms[topic].grouping.names[boxIndex]] = [];//空白列表
                      }
                      var sublist = config.rooms[topic].grouping.articles[config.rooms[topic].grouping.names[boxIndex]];
                      sublist.push(res[i]);
                      console.log("assemble box "+boxIndex,sublist);
                      config.rooms[topic].grouping.articles[config.rooms[topic].grouping.names[boxIndex]] = sublist;
                    }
                    // 逐节推送
                    for(let k=0;k<config.rooms[topic].grouping.names.length&&k<=boxIndex;k++){
                      let boxMsg = "合集:"+config.rooms[topic].grouping.names[k] + ",报数格式为: "+config.rooms[topic].grouping.names[k];
                      let articles = config.rooms[topic].grouping.articles[config.rooms[topic].grouping.names[k]];
                      for(let j=0;j<articles.length;j++){
                        boxMsg += " "+((k+1)*10+j+1);
                      }
                      
                      console.log("got box "+k,articles);
                      for(let j=0;j<articles.length;j++){
                        boxMsg+="\n"+config.numbers[j]+articles[j].title;
                        boxMsg+="\n👉"+articles[j].url;
                      }
                      msg.say(boxMsg, msg.talker());
                    }

                    //发送报数提示
                    //msg.say(sendtxt, msg.talker());

                    //设置阅读结束
                    setTimeout(function(){
                      config.rooms[topic]=JSON.parse(JSON.stringify(config.groupingTemplate));//恢复为默认设置，后续可以开始其他互阅任务
                    },config.rooms[topic].grouping.duration );                      

                    // 免费的接口，所以需要把机器人名字替换成为自己设置的机器人名字
                    sendtxt = sendtxt.replace(/Smile/g, name)
                    resolve(sendtxt)
                  } else {
                    resolve("")
                  }
                } else {
                  resolve("");
                }
          })
  })
}


//将新激活的群信息同步到后端
function syncRoom(topic, room) {
  let roomId = room.id;
  console.log("try to sync wx group. ",topic,roomId);
  return new Promise((resolve, reject) => {
    let url = config.sx_api+"/wx/wxGroup/rest/sync"
    request({
              url: url,
              method: 'POST',
              json:{
                gname:topic,
                gid: roomId,
                members: 1,//当前传递固定值
                token: config.broker.token,
                brokerId: config.broker.id
              }
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("got sync status.",body);
                  //let res = JSON.parse(body)
                  let res = body;
                  //TODO 立即启动默认任务
                  if(res.task && res.task.length>0){
                    console.log("sync done. try to schedule jobs...");
                    for(let k=0;k<res.task.length;k++){
                      scheduleJobs(room, res.task[k]);
                    }     
                    //通知启动成功：在定时任务自动启动时该通知能帮助查看bot状态
                    sendWebHook("云助手已启动"+res.task.length+"项任务","将通过默认达人自动分发选品","https://www.biglistoflittlethings.com/ilife-web-wx/broker/bot.html","https://www.biglistoflittlethings.com/static/icon/robot1.png");                                   
                  }else{
                    console.log("sync done. no jobs to schedule");
                  }
                  
                } else {
                  console.log("sync error.")
                }
          })
  })
}

//检查发布链接用户是否已注册
//用户昵称为msg.talker().name()
//参数：msg当前对话，url文章地址，已经经过校验
function checkBrokerByNicknameForPublishArticle(msg,room,articleUrl) {
  if(!msg.talker() || !msg.talker().name())
    return "啊哦，没找到对应的信息，需要先点击上面的链接关注";
  console.log("try to check broker by nickname. [nickname]",msg.talker().name());
  return new Promise((resolve, reject) => {
    let url = config.sx_api+"/mod/broker/rest/brokerByNickname?nickname="+encodeURIComponent(msg.talker().name())
    request({
              url: url,
              method: 'GET'
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("got result.",body);
                  let res = JSON.parse(body)
                  //let res = body;
                  if(res.status){
                    //发布文章
                    submitArticle(msg,room, res.data, articleUrl);
                  }else{
                    resolve("啊哦，好像还没关注哇，点击上面的链接关注并发布文章或公众号哦~~")
                  }
                } else {
                  resolve("啊哦，好像遇到问题了，也可以直接点击上面的链接关注并发布文章或公众号哦~~")
                }
          })
  })
}
//发布文章
function submitArticle(msg,room, broker, articleUrl){
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>    
  console.log("try to submit article. ",articleUrl,broker);
  /*return*/ new Promise((resolve, reject) => {
    let url = config.sx_api+"/wx/wxArticle/rest/article"
    request({
              url: url,
              method: 'POST',
              json:{
                      url:articleUrl,
                      broker:broker
                  }
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("submit article succeed.",body);
                  //let res = JSON.parse(body)
                  let res = body;
                  //反馈消息
                  if(res.status){
                    checkArticleGrouping(msg,room, broker, res.data);
                  }else{
                    console.log("submit article failed.");
                    //do nothing
                  }

                } else {
                  console.log("error while publish article",error)
                }
          })
  })  
}
//检查是否已经发过文章，一次开车仅允许一篇文章
function checkArticleGrouping(msg,room, broker, article){
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>    
  console.log("try to check grouping article. ");
  /*return*/ new Promise((resolve, reject) => {
    let url = config.sx_api+"/wx/wxArticle/rest/grouping-articles?from=0&to=1&openid=&code="+config.rooms[topic].grouping.code+"&publisherOpenid="+broker.openid
    request({
              url: url,
              method: 'get',
              /**
              json:{
                      from:0,
                      to:1,//仅用于判断，1条即可
                      openid:"",//忽略是否已经阅读
                      code:config.rooms[topic].grouping.code,//微信群编号
                      publisherOpenid:broker.openid//发布者 openid：只显示指定发布者的内容
                    }
              //*/
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("check grouping article succeed.",body);
                  let res = JSON.parse(body)
                  //let res = body;
                  if(res.length==0){//没有则继续添加到grouping
                    groupingArticle(msg,room, broker, article)
                  }else{//提示已经发布了，别瞎折腾了
                    //反馈消息
                    let txt = "规则：每人每次仅限一篇";
                    if(broker.points < 2){
                      txt += "。阅豆不多了，阅读或关注都可以增加哦~~"
                    }
                    room.say(txt, msg.talker());
                  }
                } else {
                  console.log("error while check grouping article",error)
                }
          })
  })  
}
//将文章加入班车
function groupingArticle(msg,room, broker, article){
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>    
  console.log("try to grouping article. ",article,broker,config.rooms[topic].grouping);
  /*return*/ new Promise((resolve, reject) => {
    let url = config.sx_api+"/wx/wxGrouping/rest/grouping"
    request({
              url: url,
              method: 'POST',
              json:{
                      code:config.rooms[topic].grouping.code,
                      timeFrom:new Date().getTime(), //config.rooms[topic].grouping.timeFrom.getTime(),
                      timeTo: new Date().getTime() + config.rooms[topic].grouping.duration,//config.gourping.timeFrom.getTime()+config.rooms[topic].grouping.duration,
                      subjectType:'article',
                      subjectId: article.id
                    }
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("submit article succeed.",body);
                  //let res = JSON.parse(body)
                  let res = body;
                  //反馈消息
                  let txt = "文章已加入，稍等出合集";
                  if(broker.points < 2){
                    txt += " ⛽阅豆不足，要多阅哦~~"
                  }
                  room.say(txt, msg.talker());
                } else {
                  console.log("error while grouping article",error)
                }
          })
  })  
}


//检查提交报数用户是否为注册达人。如果未注册则直接提示注册
//已注册则直接完成报数
//用户昵称为msg.talker().name()
//按照分箱数据先后提交报数
function checkBrokerByNickname(msg,articles,readCounts) {
  if(!msg.talker() || !msg.talker().name())
    return "啊哦，没找到对应的信息，需要先点击上面的链接关注";
  console.log("try to check broker by nickname. [nickname]",msg.talker().name());
  return new Promise((resolve, reject) => {
    let url = config.sx_api+"/mod/broker/rest/brokerByNickname?nickname="+encodeURIComponent(msg.talker().name())
    request({
              url: url,
              method: 'GET'
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("got result.",body);
                  let res = JSON.parse(body)
                  //let res = body;
                  if(res.status){
                    //逐组提交
                    for(let k=0;k<articles.length;k++){
                      //扣除阅豆并记录阅读事件
                      costPoints(msg, articles[k],res.data,readCounts[k]);
                    }
                  }else{
                    resolve("啊哦，好像还没关注哇，点击上面的链接关注并发布文章或公众号哦~~")
                  }
                } else {
                  resolve("啊哦，好像遇到问题了，也可以直接点击上面的链接关注并发布文章或公众号哦~~")
                }
          })
  })
}

//扣除阅豆
function costPoints(msg, article,reader,readCount){
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>    
  console.log("try to cost points. ",article,reader,readCount);
  /*return*/ new Promise((resolve, reject) => {
    let url = config.sx_api+"/wx/wxArticle/rest/exposure"
    request({
              url: url,
              method: 'POST',
              json:{
                      articleId:article.id,
                      readerOpenid:reader.openid,
                      groupingCode:config.rooms[topic].grouping.code,
                      readCount:readCount
                    }
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("cost points succeed.",body);
                  //let res = JSON.parse(body)
                  let res = body;
                  //记录到CK
                  logPointCostEvent(msg, article,res,reader, readCount);
                } else {
                  console.log("error while cost points",error)
                }
          })
  })  
}

//提交CK记录
function logPointCostEvent(msg, article,publisher,reader,readCount){
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>  
  console.log("try to log point cost event. ",article,reader,readCount);
  /*return*/ new Promise((resolve, reject) => {
    let q = "insert into ilife.reads values ('"+md5(article.id+reader.openid)+"','"+
                    publisher.openid+"','"+
                    publisher.brokerId+"','"+
                    publisher.nickname+"','"+
                    publisher.avatarUrl+"','"+
                    reader.openid+"','"+
                    reader.nickname+"','"+
                    reader.avatarUrl+"','"+
                    article.id+"','"+
                    article.title+"','"+
                    article.url+"',"+
                    publisher.points+","+readCount+",'"+config.rooms[topic].grouping.code+"',now())"
    let url = config.analyze_api+"?query="+encodeURIComponent(q)
    request({
              url: url,
              method: 'POST',
              headers: {
                "Authorization":"Basic ZGVmYXVsdDohQG1AbjA1"
              }
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("log cost points succeed.",body);
                  //let res = JSON.parse(body)
                } else {
                  console.log("error while log  point cost event",error)
                }
          })
  })  
}


//发送有偿阅读列表。需要检查是否有其他互阅。
function sendPaidRead(msg){
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>  
  //需要检查是否有尚未结束互阅车
  if(config.rooms[topic] && config.rooms[topic].grouping && config.rooms[topic].grouping.timeFrom && config.rooms[topic].grouping.duration ){
    var waitMillis = new Date().getTime() - (config.gourping.timeFrom.getTime()+config.rooms[topic].grouping.duration);
    if( waitMillis > 60*1000 ){
      return "当前车次尚未结束，请加入或"+(waitMillis/1000/60)+"分钟后开始";
    }
  }
  //需要检查时间离下一个整点是否足够
  var next = new Date();
  next.setHours(next.getHours()+1);
  next.setMinutes(0);
  next.setSeconds(0);
  var spareMillis = next.getTime()-new Date().getTime();
  if(spareMillis<6*60*1000){
    return "请稍等，下一个车次"+(spareMillis/1000/60)+"分钟后开始，请结束后发起";
  }

  var now = new Date();

  //将链接保存为短链
  let eventId = crypto.randomUUID();
  let itemKey = "page_"+eventId;
  let fromBroker = "system";//TODO 需要替换为当前达人
  let fromUser = "bot";//固定为机器人
  let channel = "wechat";
  //生成code
  var groupingCode = generateShortCode(eventId);
  //起止时间
  /**
  var timeFrom = now.getTime();
  var timeTo = timeFrom + 60*60*1000;//1小时有效
  let url =  config.sx_wx_api+"/publisher/articles-grouping.html?code="+groupingCode+"&timeFrom="+timeFrom+"&timeTo="+timeTo+"&groupingName="+(now.getHours()+"点"+now.getMinutes()+"分列表");
  let shortCode = generateShortCode(url);
  saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,url,shortCode);  
  //**/

  //设置本地互阅会话
  if(!config.rooms[topic])config.rooms[topic]=JSON.parse(JSON.stringify(config.groupingTemplate));//根据grouping模板设置
  config.rooms[topic].grouping.timeFrom = new Date();
  config.rooms[topic].grouping.duration = 5*60*1000;
  config.rooms[topic].grouping.code = groupingCode;
  config.rooms[topic].grouping.page = 0;
  config.rooms[topic].grouping.articles = {};
  config.rooms[topic].grouping.name = now.getHours()+"点"+now.getMinutes()+"分文章列表";

  //TODO：查询金币文章列表并推送

  //直接返回文字信息即可
  var txt = "TODO 查询金币文章列表并推送";
  return txt;
}

//返回互关列表：直接发送文字及链接
function sendGroupSubscribe(msg){
  //将链接保存为短链
  let eventId = crypto.randomUUID();
  let itemKey = "page_"+eventId;
  let fromBroker = "system";//TODO 需要替换为当前达人
  let fromUser = "bot";//固定为机器人
  let channel = "wechat";
  //生成code
  var groupingCode = generateShortCode(eventId);
  //起止时间
  var timeFrom = new Date().getTime();
  var timeTo = timeFrom + 60*60*1000;//1小时有效
  let url =  config.sx_wx_api+"/publisher/accounts-grouping.html?code="+groupingCode+"&timeFrom="+timeFrom+"&timeTo="+timeTo;
  let shortCode = generateShortCode(url);
  saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,url,shortCode);  
  //直接返回文字信息即可
  var txt = "请进列表👇\n"+config.sx_wx_api2 + shortCode+"\n可通过「查看报告」获取结果";
  return txt;
}

//生成短码
function generateShortCode(url){
    var chars = "0123456789abcdefghigklmnopqrstuvwxyzABCDEFGHIGKLMNOPQRSTUVWXYZ".split("");
    var hashCode = md5(url);//根据原始URL等到hash
    var codeArray = [];
    for(var i=0;i<4;i++){//将hash值分解为4段，分别处理
        var subStr = hashCode.substr(i*8,8);
        //console.log("try generate hash code.",hashCode,subStr);
        var subHexNumber = 0x3FFFFFFF & parseInt(subStr,16);//得到前30位
        var outChars = "";
        for(var j=0;j<6;j++){//循环获得每组6位的字符串
            var index = 0x0000003D & subHexNumber;
            outChars += chars[index];
            subHexNumber = subHexNumber>>5;//每次移动5位
        }
        codeArray.push(outChars);
    }
    console.log("got short codes.",codeArray);
    return codeArray[new Date().getTime()%4];//随机返回一个
}

//存储短码到数据库
function saveShortCode(eventId, itemKey, fromBroker, fromUser, channel, longUrl, shortCode) {
  console.log("try to save short url...",shortCode,longUrl);
  return new Promise((resolve, reject) => {
    let q = "insert into ilife.urls values ('"+eventId+"','"+itemKey+"','"+fromBroker+"','"+fromUser+"','"+channel+"','"+longUrl+"','"+shortCode+"',now())";
    request({
              url: config.analyze_api+"?query="+encodeURIComponent(q),
              method: 'POST',
              headers: {
                "Authorization":"Basic ZGVmYXVsdDohQG1AbjA1"
              }
            },
            function(error, response, body) {
                console.log("===short code saved.===\n",body);
          })
  })
}

//检查是否是图片链接，对于不是图片的则不发送
function isImage(imgUrl){
  if(!imgUrl)return false;
  return imgUrl.endsWith(".jpg") || imgUrl.endsWith(".jpeg") || imgUrl.endsWith(".png") || imgUrl.endsWith(".jpg");
}

//检查是否是微信公众号文章链接
function isUrlValid(url) {
    //仅支持短连接，不支持带参数的长链接
    if(url&&url.trim().length>0){
        url = url.split("?")[0];
    }
    return /^https:\/\/mp\.weixin\.qq\.com\/s\/[-a-zA-Z0-9+&@#/%?=~_|!:,.;]*[-a-zA-Z0-9+&@#/%=~_|]+$/i.test(url);
}

/**
 * 解析返回的任务并启动定时器
 * 参数：
 * room：在回调中带入
 * data：web请求返回的数据
 */
async function scheduleJobs(room,jsondata) {
    console.log("try to schedule job. ",jsondata);
    var job  = jsondata;
    var topic = job.wxgroup.name;
    var tags = job.tags;
    if(!tags || tags.trim().length==0)tags="*";//默认查询所有
    //加载群聊
    var roomId = job.wxgroup.gid;//默认直接从后端获取微信群ID
    if(!roomId){//如果没有则从前端roomList查询获取
        roomId = config.room.roomList[topic];
    }else{//将后端加载的群聊加入roomList，响应消息
      config.room.roomList[topic] = roomId;
    }
    if(!roomId){
        console.log("cannot find room id by topic. ignore.[topic]",topic);
        return;
    }

    console.log("schedule job ... ");
    
    //初始化rooms配置
    if(!config.rooms[topic])config.rooms[topic]=JSON.parse(JSON.stringify(config.groupingTemplate));//根据grouping模板设置
    //设置群owner信息
    config.rooms[topic].fromBroker = job.broker.id;
    //config.rooms[topic].fromUser = job.broker.openid;//默认采用系统默认用户   
    //分别加载任务：即时加载仅支持自动推送及选品推送
    if(job.type == "sendItem"){//根据关键词逐条发送
        schedule.scheduleJob(job.cron, function(){
                                                  //随机延后几分钟，模拟随机发送
                                                  let randomMills = 10+Math.floor(Math.random()*config.pushRandom);
                                                  setTimeout(function(){
                                                    sendItem(topic, tags, room);
                                                  },randomMills);
                                                }); //推送商品：标题、来源、价格、首图、链接。注意：链接只能发裸链
    }else if(job.type == "sendFeature"){//发送主推(feature)商品
        schedule.scheduleJob(job.cron, function(){
                                                  //随机延后几分钟，模拟随机发送
                                                  let randomMills = 10+Math.floor(Math.random()*config.pushRandom);
                                                  setTimeout(function(){
                                                    sendFeatureV2(topic, room);
                                                  },randomMills);                                                  
                                                }); //推送主推商品：能够将最近添加的feature商品推送到
    }else{
        //do nothing
        console.log("Unkown job type.", job.type);
    }
}


/**
 * send item
 * 根据关键字搜索商品，并推送
 */
async function sendItem(topic, keywords, room) {
    //检查推送时间戳
    if(config.rooms[topic] && (new Date().getTime() - config.rooms[topic].autoPushTimestamp < config.pushDuration) ){
      console.log("push msg too frequent. ignore.");
      return;
    }
    //需要检查是否有尚未结束互阅车
    if(config.rooms[topic]&&config.rooms[topic].grouping && config.rooms[topic].grouping.timeFrom && config.rooms[topic].grouping.duration ){
      console.log("confilct with ongoing grouping read. ignore.");
      return;    
    } 

    if(!room)return;
    console.log('search item by keywrods.[keywords]'+keywords+" [room]"+ room)
    //根据设置的关键字构建query
    let query = {
                    //"from":config.rooms[topic].offset,
                    "from":0, //采用随机排序
                    "size":1,
                    /*
                    "query": {
                        "match_all": {}
                    },
                    //**/
                    "query": {
                      "bool": {
                        "must_not": [{
                            "exists": { "field" : "status.inactive" }
                        }]
                      }
                    },                      
                    "sort": [
                        {"_script": {
                              "script": "Math.random()",
                              "type": "number",
                              "order": "asc"
                            }
                        },                    
                        { "_score":   { "order": "desc" }},
                        { "@timestamp": { "order": "desc" }}
                    ]
                }
    if(keywords && keywords.trim().length>0 && keywords.trim()!='*'){
        query = {
                    //"from":config.rooms[topic].offset,
                    "from":0, //采用随机排序
                    "size":1,    
                    /*  
                    "query": {
                      "query_string": {
                        "query": keywords,
                        "default_field": "full_text"
                      }
                    },
                    //*/
                    "query": {
                      "bool": {
                        "should": [{
                          "match": {
                            "full_text": keywords
                          }
                        }],
                        "must_not": [{
                            "exists": { "field" : "status.inactive" }
                        }]
                      }
                    },                    
                    "sort": [
                        {"_script": {
                              "script": "Math.random()",
                              "type": "number",
                              "order": "asc"
                            }
                        },                     
                        { "_score":   { "order": "desc" }},
                        { "@timestamp": { "order": "desc" }}
                    ]
                  }      
    }

    //发送文字
    let res = await requestItem(topic,query,room)
    try{
      room.say(res)    
    }catch(err){
      console.log("failed send item",err)
    }
}
/**
 * 用于激活后立即启动推送任务
 *
 * 根据条件查询商品信息并推送
 * 支持应用侧设置搜索条件
 * 参数：
 * queryJson: 组织好的查询条件
 */
function requestItem(topic,queryJson, room) {
  console.log("try search. [query]",queryJson);
  return new Promise((resolve, reject) => {
    let url = config.es_api
    request({
              url: url,
              method: 'POST',
              json: queryJson
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("got search result.",body);
                  //let res = JSON.parse(body)
                  let res = body;
                  if (res.hits && res.hits.total>0 && res.hits.hits && res.hits.hits.length>0) {
                    //随机组织1-3条，组成一条返回
                    let total = 1; // Math.floor(Math.random() * 3);//取1-4条随机
                    let send = ""; // "🔥好物推荐：";//res.data.reply
                    for (let i = 0; i < res.hits.hits.length && i<total; i++) {
                      var item  = res.hits.hits[i]._source;
                      let text = item.distributor.name+" "+(item.price.currency?item.price.currency:"￥")+item.price.sale+" "+item.title;
                      //let url =  item.link.token?item.link.token:(item.link.wap2?item.link.wap2:item.link.wap);
                      
                      let fromBroker = config.rooms[topic].fromBroker;//"system";//TODO 需要替换为当前达人
                      let fromUser = "bot";//固定为机器人
                      let channel = "wechat";

                      let url =  config.sx_wx_api+"/go.html?id="+item._key+"&fromBroker="+fromBroker+"&fromUser="+fromUser+"&from="+channel;//TODO需要添加 fromBroker信息
                      let logo = item.logo?item.logo: item.images[0]
                      let moreUrl =  config.sx_wx_api+"/index.html";
                      if(queryJson.query&&queryJson.query.query_string&&queryJson.query.query_string.query&&queryJson.query.query_string.query.trim().length>1)moreUrl+="?keyword="+encodeURIComponent(queryJson.query.query_string.query);

                      //获得短网址：单个item地址
                      let eventId = crypto.randomUUID();
                      let itemKey = item._key;
                      let shortCode = generateShortCode(url);
                      saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,url,shortCode);
                      //let url_short = config.sx_wx_api +"/s.html?s="+shortCode;
                      let url_short = config.sx_wx_api2 + shortCode;

                      //获得短网址：更多items地址
                      eventId = crypto.randomUUID();
                      itemKey = "page_"+eventId
                      shortCode = generateShortCode(moreUrl);
                      saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,moreUrl,shortCode);
                      //let moreUrl_short = config.sx_wx_api +"/s.html?s="+shortCode;
                      let moreUrl_short = config.sx_wx_api2 + shortCode;

                      //send += "\n"+text +" "+url_short;
                      send += item.distributor.name+" "+item.title; // 标题
                      if(item.price.bid && item.price.bid>item.price.sale)send += "\n❌ 原价 " + item.price.bid+(item.price.currency?(config.currency[item.price.currency]?config.currency[item.price.currency]:(" "+item.price.currency)):""); // 原价
                      //if(item.price.coupon && item.price.coupon>0)send += "【券】" + item.price.coupon; // 优惠券
                      send += "\n✅ 售价 " + item.price.sale+(item.price.currency?(config.currency[item.price.currency]?config.currency[item.price.currency]:(" "+item.price.currency)):"");
                      if(item.link.token && item.link.token.trim().length >0){
                        send += "\n👉 复制 "+item.link.token +" 并打开 "+item.distributor.name;
                      }else{
                        send += "\n立即前往👉 " + url_short;
                      }
                      
                      send += "\n\n👀更多请看👉"+moreUrl_short;
                      
                      //推送图片及文字消息
                      if(room && isImage(logo) )sendImage2Room(room, logo);

                      //推送评价结果：仅推送客观评价指标及客观评价结果
                      if(item.media){
                        let mediaKeys = [];
                        if(item.media.measure)mediaKeys.push("measure");
                        if(item.media["measure-scheme"])mediaKeys.push("measure-scheme");
                        if(mediaKeys.length==0){
                          //do nothing
                        }else if(mediaKeys.length==1){//仅有一个就直接发送
                          if(room)sendImage2Room(room, item.media[mediaKeys[0]]);                          
                        }else{//否则随机发送
                          let r = Math.floor(Math.random() * 100) % mediaKeys.length; //生成随机数
                          if(room)sendImage2Room(room, item.media[mediaKeys[r]]);
                        }                       
                      }

                      //推荐语
                      if(item.advice){
                        let adviceKeys = Object.keys(item.advice);
                        if(adviceKeys.length==0){
                          //do nothing
                        }else if(adviceKeys.length==1){//仅有一个就直接发送
                          if(room)room.say(item.advice[adviceKeys[0]]);                          
                        }else{//否则随机发送
                          let r = Math.floor(Math.random() * 100) % adviceKeys.length; //生成随机数
                          if(room)room.say(item.advice[adviceKeys[r]]); 
                        }                       
                      }  

                      //修改下标
                      config.rooms[topic].offset = config.rooms[topic].offset+1;
                      //修改推送时间戳
                      config.rooms[topic].autoPushTimestamp = new Date().getTime();

                    }
                    // 免费的接口，所以需要把机器人名字替换成为自己设置的机器人名字
                    send = send.replace(/Smile/g, name)
                    resolve(send)
                  } else {
                    config.rooms[topic].offset =0;//重新发起搜索                   
                  }
                } else {
                  config.rooms[topic].offset =0;//重新发起搜索                
                }
          })
  })
}


/**
 * 激活选品推送任务：用于群内激活后立即开始
 * 从CK查询待推送内容。每次推送一条
 */
async function sendFeatureV2(topic, room) {
  //检查推送时间戳
  if(config.rooms[topic] && (new Date().getTime() - config.rooms[topic].autoPushTimestamp < config.pushDuration) ){
    console.log("push msg too frequent. ignore.");
    return;
  }
  //需要检查是否有尚未结束互阅车
  if(config.rooms[topic]&&config.rooms[topic].grouping && config.rooms[topic].grouping.timeFrom && config.rooms[topic].grouping.duration ){
    console.log("confilct with ongoing grouping read. ignore.");
    return;    
  }  

  if(!room)return;
  console.log('Sending featured item to room2 ' + room, "topic: "+topic)  
  //发送文字
  let res = await requestFeatureV2(topic,room)
  if(room && res && res.length>"好物推荐：".length)
      room.say(res) 
}
function requestFeatureV2(topic, room) {
  console.log('request featured item to room2 ' + room, "topic: "+topic)  
  return new Promise((resolve, reject) => {
    let url = config.analyze_api +"?query=select * from ilife.features where status='pending' and groupType='wechat' and groupName='"+encodeURIComponent(topic)+"' order by ts desc limit 1 format JSON"
    console.log("try fetch featured item by url.",url);
    request({
              url: url,
              method: 'GET',
              headers: {
                "Authorization":"Basic ZGVmYXVsdDohQG1AbjA1"
              }
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  //console.log("got featured item.",body);
                  console.log("got featured item.");
                  let res = JSON.parse(body)
                  //let res = body;
                  if (res.data && res.data.length>0) {//返回仅一条
                    let total = 1;
                    //let send = "🆚🔥推荐：";
                    let send = "";

                    var featuredItem = res.data[0];
                    var item  = {};
                    try{
                      item = JSON.parse(res.data[0].jsonStr.replace(/\n/g,"\\n").replace(/\r/g,"\\r").replace(/<[^>]+>/g,"\\n")
                                                          .replace(/""\{/g,"{").replace(/\}""/g,"}").replace(/"\{/g,"{").replace(/\}"/g,"}"));//修复poster与article存储错误：这两个字段作为字符串存储，会导致出现额外的双引号
                    }catch(err){
                      console.log("failed parse json. ",res.data[0].jsonStr);
                    }

                    if(featuredItem.itemType == "item"){//是单个实例
                      console.log("got board item.");
                      let text = item.distributor.name+" "+(item.price.currency?item.price.currency:"￥")+item.price.sale+" "+item.title;
                      //let url =  item.link.token?item.link.token:(item.link.wap2?item.link.wap2:item.link.wap);

                      let fromBroker = config.rooms[topic].fromBroker;//"system";//TODO 需要替换为当前达人
                      let fromUser = "bot";//固定为机器人
                      let channel = "wechat";

                      let url =  config.sx_wx_api+"/go.html?id="+item._key+"&fromBroker="+fromBroker+"&fromUser="+fromUser+"&from="+channel;//TODO需要添加 fromBroker信息

                      let logo = item.logo?item.logo: item.images[0]
                      let moreUrl =  config.sx_wx_api+"/index.html";

                      //获得短网址：单个item地址
                      let eventId = crypto.randomUUID();
                      let itemKey = item._key;
                      let shortCode = generateShortCode(url);
                      saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,url,shortCode);
                      //let url_short = config.sx_wx_api +"/s.html?s="+shortCode;
                      let url_short = config.sx_wx_api2 + shortCode;

                      //获得短网址：更多items地址
                      eventId = crypto.randomUUID();
                      itemKey = "page_"+eventId
                      shortCode = generateShortCode(moreUrl);
                      saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,moreUrl,shortCode);
                      //let moreUrl_short = config.sx_wx_api +"/s.html?s="+shortCode;
                      let moreUrl_short = config.sx_wx_api2 + shortCode;

                      //send += "\n"+text +" "+url_short;

                      send += item.distributor.name+" "+item.title; // 标题
                      if(item.price.bid && item.price.bid>item.price.sale)send += "\n❌ 原价 " + item.price.bid+(item.price.currency?(config.currency[item.price.currency]?config.currency[item.price.currency]:(" "+item.price.currency)):""); // 原价
                      //if(item.price.coupon && item.price.coupon>0)send += "【券】" + item.price.coupon; // 优惠券
                      send += "\n✅ 售价 " + item.price.sale+(item.price.currency?(config.currency[item.price.currency]?config.currency[item.price.currency]:(" "+item.price.currency)):"");
                      if(item.link.token && item.link.token.trim().length >0){
                        send += "\n👉 复制 "+item.link.token +" 并打开 "+item.distributor.name;
                      }else{
                        send += "\n立即前往👉 " + url_short;
                      }

                      send += "\n\n👀更多请看👉"+moreUrl_short;
                      
                      //推送图片及文字消息
                      if(room && isImage(logo) )sendImage2Room(room, logo);

                      //推送评价结果：仅推送客观评价指标及客观评价结果
                      if(item.media){
                        let mediaKeys = [];
                        if(item.media.measure)mediaKeys.push("measure");
                        if(item.media["measure-scheme"])mediaKeys.push("measure-scheme");
                        if(mediaKeys.length==0){
                          //do nothing
                        }else if(mediaKeys.length==1){//仅有一个就直接发送
                          if(room)sendImage2Room(room, item.media[mediaKeys[0]]);                          
                        }else{//否则随机发送
                          let r = Math.floor(Math.random() * 100) % mediaKeys.length; //生成随机数
                          if(room)sendImage2Room(room, item.media[mediaKeys[r]]);
                        }                       
                      }

                      //推荐语
                      if(item.advice){
                        let adviceKeys = Object.keys(item.advice);
                        if(adviceKeys.length==0){
                          //do nothing
                        }else if(adviceKeys.length==1){//仅有一个就直接发送
                          if(room)room.say(item.advice[adviceKeys[0]]);                          
                        }else{//否则随机发送
                          let r = Math.floor(Math.random() * 100) % adviceKeys.length; //生成随机数
                          if(room)room.say(item.advice[adviceKeys[r]]); 
                        }                       
                      }  
                    }else if(featuredItem.itemType == "board"){//是列表board
                      console.log("got board item.");
                      send = "✅🔥精选合集：";
                      let text = item.title;

                      let fromBroker = config.rooms[topic].fromBroker;//"system";//TODO 需要替换为当前达人
                      let fromUser = "bot";//固定为机器人
                      let channel = "wechat";

                      let url =  config.sx_wx_api+"/board2-waterfall.html?id="+item.id+"&fromBroker="+fromBroker+"&fromUser="+fromUser+"&from="+channel;//TODO需要添加 fromBroker信息

                      let logo = item.logo;

                      //获得短网址：单个item地址
                      let eventId = crypto.randomUUID();
                      let itemKey = "board_"+item.id;
                      let shortCode = generateShortCode(url);
                      saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,url,shortCode);
                      let url_short = config.sx_wx_api2 + shortCode;

                      send += "\n"+text +"\n立即前往👉"+url_short;
                      
                      //推送图片
                      if(room && isImage(logo) )sendImage2Room(room, logo);
                      //推送描述文字
                      if(item.description && item.description.trim().length>2){
                        if(room)room.say(item.description); 
                      }
                    }else{
                      console.log("unknonw item type. ignore.",item.itemType);
                      send = "";
                    }

                    //修改下标
                    config.rooms[topic].featuredOffset = config.rooms[topic].featuredOffset + 1;      
                    //修改推送时间戳
                    config.rooms[topic].autoPushTimestamp = new Date().getTime();

                    //从CK删除推送记录：直接根据eventId再次写入即可
                    removeFeatureItem(res.data[0].eventId,
                                      res.data[0].brokerId,
                                      res.data[0].groupType,
                                      res.data[0].groupId,
                                      res.data[0].groupName,
                                      res.data[0].itemType,
                                      res.data[0].itemKey,
                                      res.data[0].jsonStr);        

                    // 免费的接口，所以需要把机器人名字替换成为自己设置的机器人名字
                    send = send.replace(/Smile/g, name)
                    resolve(send)
                  } else {
                    console.log("no featured item found.");
                    //config.rooms[topic].featuredOffset=0;//重新发起搜索
                  }
                } else {
                  console.log("fetch featured item error.",error,response);
                  //config.rooms[topic].featuredOffset=0;//重新发起搜索
                }
          })
  })
}

//删除推荐条目：更新状态为done
function removeFeatureItem(eventId, brokerId, groupType, groupId, groupName,itemType, itemKey, jsonStr) {
  console.log("try to change featured item status...",eventId);
  return new Promise((resolve, reject) => {
    let q = "insert into ilife.features values ('"+eventId+"','"+brokerId+"','"+groupType+"','"+groupId+"','"+groupName+"','"+itemType+"','"+itemKey+"','"+jsonStr+"','done',now())";
    request({
              url: config.analyze_api+"?query="+encodeURIComponent(q),
              method: 'POST',
              headers: {
                "Authorization":"Basic ZGVmYXVsdDohQG1AbjA1"
              }
            },
            function(error, response, body) {
                console.log("===feature item status changed.===\n",body,error);
          })
  })
}
