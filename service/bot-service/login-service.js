import fetch from 'node-fetch'
import schedule from 'node-schedule'
import md5 from "md5"
import crypto from "crypto"
import request from "request"
import { FileBox }  from 'file-box'

import fs from 'fs'
import path from 'path'

// 配置文件
import config from "../../config/index.js"

// 同步群聊
import { syncRoomInfo,sendWebHook } from "../../src/common.js"

const name = config.name
/**
 * @method onLogin 当机器人成功登陆后，会触发事件，并会在事件中传递当前登陆机器人的信息
 * @param {*} user 
 */
 export const onLogin = bot => {
    return async function onLogin(user){
        try {
            console.log('========================👉onLogin👈========================\n\n')
            console.log(`机器人信息：${JSON.stringify(user)}\n\n`)
            console.log(`bot id：`,bot.id)
            console.log(`
                               //
                   \\         //
                    \\       //
            ##DDDDDDDDDDDDDDDDDDDDDD##
            ## DDDDDDDDDDDDDDDDDDDD ##      
            ## DDDDDDDDDDDDDDDDDDDD ##      
            ## hh                hh ##      ##         ## ## ## ##   ## ## ## ###   ##    ####     ##     
            ## hh    //    \\     hh ##      ##         ##       ##   ##             ##    ## ##    ##
            ## hh   //      \\    hh ##      ##         ##       ##   ##             ##    ##   ##  ##
            ## hh                hh ##      ##         ##       ##   ##     ##      ##    ##    ## ##
            ## hh      wwww      hh ##      ##         ##       ##   ##       ##    ##    ##     ####
            ## hh                hh ##      ## ## ##   ## ## ## ##   ## ## ## ###   ##    ##      ###
            ## MMMMMMMMMMMMMMMMMMMM ##    
            ##MMMMMMMMMMMMMMMMMMMMMM##      微信机器人名为: [${user.payload.name}] 已经扫码登录成功了。\n\n
            `)

            //对于未退出重新启动的情况，需要先根据原botid更新后端
            //尝试读取本地缓存的botId，同时将原botId、当前botId及二维码链接推送到后台，通知重新扫码
            let file = config.localFile;
            fs.readFile(file, function(err, data){syncBot(bot,user,data)}); 

            //装载对应的达人，同步broker信息
            checkBrokerByNickname(bot,user);

            //TODO 加载群任务，并实例化
            //scheduleSendMessage(bot,user);
            //scheduleSendGroupRead(bot,user);
            //scheduleSendGroupingUrl(bot,user);

            //加载群任务，并实例化
            await loadWxGroupJobsByNickname(bot,user);               
        } catch (error) {
            console.log(`onLogin: ${error}`)
        }

    }
}

/**
* 启动定时任务: 示例
*/
function scheduleSendMessage(bot,user){
    //TODO 需要根据登录用户加载 托管群及任务，然后逐个schedule
    console.log('start schedule auto send message')
    let topic="sx临时群";
    schedule.scheduleJob('0 */5 * * * ?', function(){sendItem(topic,"拼多多",bot)}); //send every 5 min  
}
/**
* 启动定时任务: 示例
*/
function scheduleSendGroupRead(bot,user){
    //TODO 需要根据登录用户加载 托管群及任务，然后逐个schedule
    console.log('start schedule auto send message')
    let topic="sx临时群";
    schedule.scheduleJob('0 */10 * * * ?', function(){sendGroupRead(topic,bot)}); //send every 5 min  
}
/**
* 启动定时任务: 示例
*/
function scheduleSendGroupingUrl(bot,user){
    //TODO 需要根据登录用户加载 托管群及任务，然后逐个schedule
    console.log('start schedule auto send url')
    let topic="sx临时群";
    schedule.scheduleJob('0 */3 * * * ?', function(){sendGroupingUrl(topic,bot)}); //send every 5 min  
}

//根据nickname获取达人信息
function checkBrokerByNickname(bot, user) {
    var nickname = user.payload.name;
    console.log("try to check broker by nickname. [nickname]",nickname);
    return new Promise((resolve, reject) => {
        let url = config.sx_api+"/mod/broker/rest/brokerByNickname?nickname="+encodeURIComponent(nickname)
        request({
              url: url,
              method: 'GET'
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("got  broker info.",body);
                  let res = JSON.parse(body)
                  //let res = body;
                  if(res.status){
                    //更新本地激活码，便于后续识别
                    var broker = res.data;
                    config.broker = res.data;//将broker写入缓存
                    if(broker.token && broker.token.trim().length>0){
                        console.log("got token.",broker.token);
                        config.magicCode += "__"+broker.token;//支持自定义激活口令
                    }else{
                        console.log("no token found.ignore.[nickname]",nickname);
                    }
                  }else{
                    console.log("no tasks found by nickname.[nickname]",nickname);
                  }
                } else {
                  console.log("error while checking wxgroup tasks by nickname.[nickname]",nickname);
                }
          })
    })
}

/**
 * 根据用户昵称查询所有托管微信群任务。 注意：当前是通过昵称查询，需要用户在各个群内保持昵称不变
 * 查询结果直接返回任务列表，如果没有激活任务则返回空列表
 * 查询完成后立即schedule
 */
function loadWxGroupJobsByNickname(bot, user) {
    var nickname = user.payload.name;
    console.log("try to check broker by nickname. [nickname]",nickname);
    return new Promise((resolve, reject) => {
        let url = config.sx_api+"/wx/wxGroupTask/rest/byNickname?nickname="; //+encodeURIComponent(nickname) //当前获取所有任务，使用同一个账号发送
        request({
              url: url,
              method: 'GET'
            },
            function(error, response, body) {
                if (!error && response.statusCode == 200) {
                  console.log("got wxgroup tasks.",body);
                  let res = JSON.parse(body)
                  //let res = body;
                  if(res && res.length>0){
                    //逐条schedule
                    for(let k=0;k<res.length;k++){
                      scheduleJobs(bot, res[k]);
                    }
                    //设置offse：根据本地文件设置。注意必须在添加本地任务后开始
                    //尝试读取本地缓存的botId，同时将原botId、当前botId及二维码链接推送到后台，通知重新扫码
                    let file = config.localFile;
                    fs.readFile(file, function(err, data){loadOffset(data)});  
                    //通知启动成功：在定时任务自动启动时该通知能帮助查看bot状态
                    sendWebHook("云助手已启用","将自动分发选品到微信群","https://www.biglistoflittlethings.com/ilife-web-wx/broker/bot.html","https://www.biglistoflittlethings.com/static/icon/robot1.png");
                  }else{
                    console.log("no tasks found by nickname.[nickname]",nickname);
                  }
                } else {
                  console.log("error while checking wxgroup tasks by nickname.[nickname]",nickname);
                }
          })
    })
}

/**
 * 解析返回的任务并启动定时器
 * 参数：
 * bot：在回调中带入
 * data：web请求返回的数据
 */
async function scheduleJobs(bot,jsondata) {
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
    const room = bot.Room.load(roomId) //注意：这里需要后端同步群聊ID。可以在发送激活码时补充gid信息。另一种方案是在前端查询roomList得到。
    console.log("try sync room. ",topic);
    try{
      await room.sync()
      if(room &&  config.broker &&  config.broker.id){
        room.brokerId = config.broker.id; //添加所属brokerId
      }
      syncRoomInfo(room);
    }catch(err){
      console.log("failed sync room. ignore. [topic]"+topic , err);
    }
    
    //初始化rooms配置
    if(!config.rooms[topic])config.rooms[topic]=JSON.parse(JSON.stringify(config.groupingTemplate));//根据grouping模板设置
    //设置群owner信息
    config.rooms[topic].fromBroker = job.broker.id;
    //config.rooms[topic].fromUser = job.broker.openid;//默认采用系统默认用户   
    //分别加载任务
    if(job.type == "sendItem"){//根据关键词逐条发送
        schedule.scheduleJob(job.cron, function(){
                                                  //sendItem(topic, tags, bot)
                                                  //随机延后几分钟，模拟随机发送
                                                  let randomMills = 10+Math.floor(Math.random()*config.pushRandom);
                                                  setTimeout(function(){
                                                    sendItem(topic, tags, bot);
                                                  },randomMills);
                                                }); //推送商品：标题、来源、价格、首图、链接。注意：链接只能发裸链
    }else if(job.type == "sendFeature"){//发送主推(feature)商品
        schedule.scheduleJob(job.cron, function(){
                                                  //sendFeatureV2(topic, bot)
                                                  //随机延后几分钟，模拟随机发送
                                                  let randomMills = 10+Math.floor(Math.random()*config.pushRandom);
                                                  setTimeout(function(){
                                                    sendFeatureV2(topic, bot);
                                                  },randomMills);                                                  
                                                }); //推送主推商品：能够将最近添加的feature商品推送到
    }else if(job.type == "sendGroupRead"){
        schedule.scheduleJob(job.cron, function(){sendGroupRead(topic, bot)}); //推送互阅开车信息
    }else if(job.type == "sendToppingRead"){
        schedule.scheduleJob(job.cron, function(){sendToppingRead(topic, bot)}); //推送置顶文章列表：查询置顶文章并推送到列表，接受报数
    }else if(job.type == "sendPaidRead"){
        schedule.scheduleJob(job.cron, function(){sendPaidRead(topic, bot)}); //推送有偿阅读链接：查询金币文章，并推送到指定群
    }else if(job.type == "sendGroupingUrl"){
        //不需要主动任务，将根据群内消息自动回复
        //schedule.scheduleJob(job.cron, function(){sendGroupingUrl(topic, bot)}); // 推送文章列表链接
    }else{
        //do nothing
        console.log("Unkown job type.", job.type);
    }
}

/**
 * send message
 */
async function sendMessage(topic,bot) {
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    if(!room)return;
    console.log('Sending daily to room ' + room)
    //发送文字
    try{
        let txtMsg = "该交周报了，没交的话，我隔5分钟来问一次";
        sendText2Room(room, txtMsg)
        //发送图片
        let imageMsg = FileBox.fromUrl('https://www.biglistoflittlethings.com/static/logo/distributor/ilife.png')
        sendText2Room(room, imageMsg)   
    }catch(err){
      console.log("error while send msg",err);
    }  
}

/**
 * send text message
 * test 
 */
async function sendText(topic,bot) {
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    if(!room)return;
    console.log('Sending daily to room ' + room)
    try{
        //let dailyText = await getDaily()
        let dailyText = "该交周报了，没交的话，我隔5分钟来问一次";
        const member = await room.member({name: config.broker.nickname}) //需要确认是否在群里，如果不在就不能发
        if(member){
          room.say(dailyText)  
        }else{
          console.log("bot not in target room. skipped.");
        }         
    }catch(err){
      console.log("error while send text",err);
    }     
}

/**
 * send text message
 * test 
 */
async function sendText2Room(room,text) {
    console.log('Sending text to room ' + room)
    try{
        const member = await room.member({name: config.broker.nickname}) //需要确认是否在群里，如果不在就不能发
        if(member){
          room.say(text)  
        }else{
          console.log("bot not in target room. skipped.");
        }         
    }catch(err){
      console.log("error while send text",err);
    }     
}

/**
 * send url card message 
 * test 
 * 注意：仅pad协议支持，web协议不支持
 */
async function sendGroupingUrl(topic,bot) {
    //检查推送时间戳
    if(config.rooms[topic] && (new Date().getTime() - config.rooms[topic].autoPushTimestamp < config.pushDuration) ){
      console.log("push msg too frequent. ignore.");
      return;
    }

    const room = await bot.Room.find({topic: topic}) //get the room by topic
    if(!room)return;
    console.log('Sending daily to room ' + room)
    try{
        let dailyUrl = new bot.UrlLink({
          description: '10秒阅读要求，还可以开白转载',
          thumbnailUrl: 'https://www.biglistoflittlethings.com/static/logo/grouping/default.png',
          title: '文章发进列表，方便阅读',
          url: 'https://www.biglistoflittlethings.com/ilife-web-wx/publisher/articles.html',
        });
        sendText2Room(room,dailyUrl);

        //发送一条提示语：随机获取
        let randomIndex = Math.floor(Math.random()* config.tips.length);
        let dailyText = config.tips[randomIndex];//"群里阅读少，加入列表可以让更多人看到哦~~";
        sendText2Room(room,dailyText);
    }catch(err){
      console.log("error while send url",err);
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
      const member = await room.member({name: config.broker.nickname}) //需要确认是否在群里，如果不在就不能发
      if(member){
        room.say(imageMsg)    
      }else{
        console.log("bot not in target room. skipped.");
      }      
    }catch(err){
      console.log("failed send img 2 room",err)
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
async function sendUrl2Room(room, urlInfo) {
    console.log('Sending url info to room ' + room, urlInfo)
    //发送图片
    try{
      let urlLink = new UrlLink(urlInfo);
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
 * send image message 
 * test
 */
async function sendImage(topic,bot) {
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    if(!room)return;
    console.log('Sending daily to room ' + room)
    try{
      //let dailyText = await getDaily()
      const dailyText = FileBox.fromUrl('https://www.biglistoflittlethings.com/static/logo/distributor/ilife.png')
      const member = await room.member({name: config.broker.nickname}) //需要确认是否在群里，如果不在就不能发
      if(member){
        room.say(dailyText)   
      }else{
        console.log("bot not in target room. skipped.");
      }       
    }catch(err){
      console.log("failed send img",err)
    }
}

/**
 * send item
 * 根据关键字搜索商品，并推送
 */
async function sendItem(topic, keywords, bot) {
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

    const room = await bot.Room.find({topic: topic}) //get the room by topic
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
    sendText2Room(room, res);
}

/**
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
                    let urlInfo = {}; //组织URL卡片发送
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
                      if(item.price.bid && item.price.bid>item.price.sale)send += "\n❌ 原价 " + item.price.bid +(item.price.currency?(config.currency[item.price.currency]?config.currency[item.price.currency]:(" "+item.price.currency)):""); // 原价
                      //if(item.price.coupon && item.price.coupon>0)send += "【券】" + item.price.coupon; // 优惠券
                      send += "\n✅ 售价 " + item.price.sale+(item.price.currency?(config.currency[item.price.currency]?config.currency[item.price.currency]:(" "+item.price.currency)):"");
                      if(item.link.token && item.link.token.trim().length >0){
                        send += "\n👉 复制 "+item.link.token +" 并打开 "+item.distributor.name;
                      }else{
                        send += "\n立即前往👉 " + url_short;
                      }
                      
                      send += "\n\n👀更多请看👉"+moreUrl_short;
                      
                      urlInfo.title = item.title;
                      urlInfo.description = item.distributor.name + item.tagging +" "+ item.tags;
                      urlInfo.thumbnailUrl = item.logo?item.logo.replace(/\.avif/,""):item.images[0].replace(/\.avif/,"");
                      urlInfo.url = url_short;

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
                          if(room)sendText2Room(room,item.advice[adviceKeys[0]]);                  
                        }else{//否则随机发送
                          let r = Math.floor(Math.random() * 100) % adviceKeys.length; //生成随机数
                          if(room)sendText2Room(room,item.advice[adviceKeys[r]]); 
                        }                       
                      }  

                      //修改下标
                      config.rooms[topic].offset = config.rooms[topic].offset+1;
                      //修改推送时间戳
                      config.rooms[topic].autoPushTimestamp = new Date().getTime();

                      //存储到本地文件
                      let file = config.localFile;
                      fs.readFile(file, function(err, data){syncOffset(topic,config.rooms[topic].offset,data)}); 

                    }

                    //随机发送URL卡片或文字：not ready，需要通过bot.urllink构建链接卡片
                    //sendUrl2Room(room, urlInfo);

                    // 免费的接口，所以需要把机器人名字替换成为自己设置的机器人名字
                    send = send.replace(/Smile/g, name)
                    resolve(send)
                  } else {
                    config.rooms[topic].offset =0;//重新发起搜索
                    //存储到本地文件
                    let file = config.localFile;
                    fs.readFile(file, function(err, data){syncOffset(topic,config.rooms[topic].offset,data)});                     
                  }
                } else {
                  config.rooms[topic].offset =0;//重新发起搜索
                  //存储到本地文件
                  let file = config.localFile;
                  fs.readFile(file, function(err, data){syncOffset(topic,config.rooms[topic].offset,data)});                   
                }
          })
  })
}


/**
 * obsolete. 已废弃。更改为CK推荐
 * send feature
 * 查询主推商品，通过featuredTimestamp记录更新的时间戳
 */
var featuredTimestamp = new Date();//默认为当前时间，重新启动后从当前时间开始推送
async function sendFeature(topic,bot) {
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    console.log('Sending featured item to room ' + room)
    //计算时间：每天自动更新：当天的主推商品逐条推送
    var now = new Date();
    now.setHours(0);//超过一天则从当天开始推送
    now.setMinutes(0);
    now.setSeconds(0);
    if(now.getTime()>featuredTimestamp.getTime()){
        featuredTimestamp = now;
    }
    //手动拼接时间字符串： yyyy-MM-dd HH:mm:ss
    var ts = featuredTimestamp.getFullYear();
    ts+="-"+(featuredTimestamp.getMonth()>8?"":"0")+(featuredTimestamp.getMonth()+1);
    ts+="-"+(featuredTimestamp.getDate()>9?"":"0")+featuredTimestamp.getDate();
    ts+=" "+(featuredTimestamp.getHours()>9?"":"0")+featuredTimestamp.getHours();
    ts+=":"+(featuredTimestamp.getMinutes()>9?"":"0")+featuredTimestamp.getMinutes();
    ts+=":"+(featuredTimestamp.getSeconds()>9?"":"0")+featuredTimestamp.getSeconds();
 
    //根据设置的关键字构建query
    let query = {
              "from":config.rooms[topic].featuredOffset ,
              "size":1,     
              "query": {
                "bool": {
                  "must": [
                    {
                      "match": {
                        "full_tags": "feature featured 主推"
                      }
                    },
                    {
                      "range": {
                        "@timestamp" : {
                          "gte" : ts,//"2021-09-13 01:10:30",
                          "format": "yyyy-MM-dd hh:mm:ss||yyyy"
                        }
                      }
                    }
                  ]
                }
              },
                "sort": [
                    { "@timestamp": { "order": "asc" }}
                ]
            }    
    //发送文字
    let res = await requestFeature(topic,query,room)
    if(room && res && res.length>"好物推荐：".length)
        sendText2Room(room,res);   
}

/**
 * obsolete. 已废弃。更改为CK推荐
 * 根据条件查询商品信息并推送
 * 支持应用侧设置搜索条件
 * 参数：
 * queryJson: 组织好的查询条件
 */
function requestFeature(topic,queryJson, room) {
  console.log("try search. [query]",queryJson);
  return new Promise((resolve, reject) => {
    let url = config.es_api // + "?change_utc_to_asiash" // 搜索时进行时区转换
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
                    // 随机组织1-3条，组成一条返回
                    let total = 1;//Math.floor(Math.random() * 3);//取1-4条随机
                    // let send = "🆚🔥推荐：";//res.data.reply
                    let send = "";
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
                      let url_short = config.sx_wx_api +"/s.html?s="+shortCode;

                      //获得短网址：更多items地址
                      eventId = crypto.randomUUID();
                      itemKey = "page_"+eventId
                      shortCode = generateShortCode(moreUrl);
                      saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,moreUrl,shortCode);
                      let moreUrl_short = config.sx_wx_api +"/s.html?s="+shortCode;

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
                          if(room)sendText2Room(room,item.advice[adviceKeys[0]]);                          
                        }else{//否则随机发送
                          let r = Math.floor(Math.random() * 100) % adviceKeys.length; //生成随机数
                          if(room)sendText2Room(room,item.advice[adviceKeys[r]]); 
                        }                       
                      }  

                      //修改下标
                      config.rooms[topic].featuredOffset = config.rooms[topic].featuredOffset + 1;                    

                    }
                    // 免费的接口，所以需要把机器人名字替换成为自己设置的机器人名字
                    send = send.replace(/Smile/g, name)
                    resolve(send)
                  } else {
                    config.rooms[topic].featuredOffset=0;//重新发起搜索
                  }
                } else {
                  config.rooms[topic].featuredOffset=0;//重新发起搜索
                }
          })
  })
}

/**
 * 从CK查询待推送内容。每次推送一条
 */
async function sendFeatureV2(topic, bot) {
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

  const room = await bot.Room.find({topic: topic}) //get room by topic
  if(!room)return;
  console.log('Sending featured item to room2 ' + room, "topic: "+topic)  
  //发送文字
  let res = await requestFeatureV2(topic,room)
  if(room && res && res.length>"好物推荐：".length){
    sendText2Room(room,res); 
  }
      
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
                          if(room)sendText2Room(room,item.advice[adviceKeys[0]]);                       
                        }else{//否则随机发送
                          let r = Math.floor(Math.random() * 100) % adviceKeys.length; //生成随机数
                          if(room)sendText2Room(room,item.advice[adviceKeys[r]]); 
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
                        if(room)sendText2Room(room,item.description); 
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
    let q = "insert into ilife.features values ('"+eventId+"','"+brokerId+"','"+groupType+"','"+groupId+"','"+groupName+"','"+itemType+"','"+itemKey+"','"+jsonStr.replace(/'/g, "’")+"','done',now())";
    request({
              url: config.analyze_api+"?query=",//+encodeURIComponent(q),
              method: 'POST',
              data: q,
              headers: {
                "content-type": "text/plain; charset=utf-8", // 直接提交raw数据
                "Authorization":"Basic ZGVmYXVsdDohQG1AbjA1"
              }
            },
            function(error, response, body) {
                console.log("===feature item status changed.===\n",body,error);
          })
  })
}

//返回互阅列表：直接发送文字及链接
async function sendGroupRead(topic, bot){
    //检查推送时间戳
    if(config.rooms[topic] && (new Date().getTime() - config.rooms[topic].autoPushTimestamp < config.pushDuration) ){
      console.log("push msg too frequent. ignore.");
      return;
    }

    const room = await bot.Room.find({topic: topic}) //get the room by topic
    if(!room)return;
    console.log('Sending group read msg to room ' + room)   

    let res = requstGroupRead(topic,room)
    try{
      if(res && res.length>0){
        sendText2Room(room,res)  
        //修改推送时间戳
        config.rooms[topic].autoPushTimestamp = new Date().getTime();
      }
               
    }catch(err){
      console.log("failed send group read msg.",err);
    }

}


//返回互阅列表：直接发送文字及链接
function requstGroupRead(topic,room){  
  //需要检查是否有尚未结束互阅车
  if(config.rooms[topic]&&config.rooms[topic].grouping && config.rooms[topic].grouping.timeFrom && config.rooms[topic].grouping.duration ){
    var waitMillis = new Date().getTime() - (config.rooms[topic].grouping.timeFrom.getTime()+config.rooms[topic].grouping.duration);
    if( waitMillis < 0 ){
      //return "当前车次尚未结束，请加入或"+(Math.floor(-1*waitMillis/1000/60))+"分钟后开始";
      return "";
    }
  }
  //需要检查时间离下一个整点是否足够
  var next = new Date();
  next.setHours(next.getHours()+1);
  next.setMinutes(0);
  next.setSeconds(0);
  var spareMillis = next.getTime()-new Date().getTime();
  if(spareMillis<6*60*1000 && spareMillis>0){
    //return "请稍等，"+Math.floor(spareMillis/1000/60)+"分钟后开始";
    return ""
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
  config.rooms[topic].grouping.name = now.getHours()+"点"+now.getMinutes()+"分列表";

  //设置任务，2分钟后发送列表
  setTimeout(function(){
    requestGroupingArticles(topic, room);
  },config.rooms[topic].grouping.timeout);

  //直接返回文字信息即可
  //TODO 先发送一个通知图片
  var txt = "📣阅读开始，发链接加入。每人一篇，2分钟出合集\n"+config.sx_wx_api2 +shortCode;
  return txt;
}


//根据grouping code分页加载文章列表，最多发4车
function requestGroupingArticles(topic, room) {
  //获取topic
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
                    let sendtxt = "🚩本轮共"+(Math.floor((res.length+config.rooms[topic].grouping.pageSize-1)/config.rooms[topic].grouping.pageSize))+"合集，请阅读，__howlong分钟后汇总结果。报数格式：\nA 11 22 33 44 55";//res.data.reply
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
                      sendText2Room(room,boxMsg);
                    }

                    //发送报数提示
                    //sendtxt = sendtxt.replace(/__howlong/,Math.floor(res.length*15/60)>0?(""+Math.floor(res.length*15/60)):"1");
                    sendtxt = sendtxt.replace(/__howlong/,"5");
                    sendText2Room(room,sendtxt);

                    //设置定时任务推送报告链接，默认按照timeout设置发送
                    setTimeout(function(){
                      sendGroupReport(topic, room);
                    },/* 5*60*1000 config.rooms[topic].grouping.timeout*2 */ res.length<4 ? 1*60*1000 : res.length*15*1000 );                      

                    // 免费的接口，所以需要把机器人名字替换成为自己设置的机器人名字
                    sendtxt = sendtxt.replace(/Smile/g, name)
                    resolve(sendtxt)
                  } else {
                    config.rooms[topic]=JSON.parse(JSON.stringify(config.groupingTemplate));//取消grouping，恢复默认grouping模板设置
                    //sendText2Room(room,"⛔文章过少，车次取消，召集10-20人就可以发送 互阅发车 再次开始哦~~");
                    resolve("⛔文章过少，车次取消，召集10-20人就可以发送 互阅发车 再次开始哦~~")
                  }
                } else {
                  config.rooms[topic]=JSON.parse(JSON.stringify(config.groupingTemplate));//取消grouping，恢复默认grouping模板设置
                  sendText2Room(room,"啊哦，出合集遇到问题，请直接进入列表阅读~~");
                  resolve("啊哦，出合集遇到问题，请直接进入列表阅读~~")
                }
          })
  })
}

//推送互阅报告：直接发送文字及链接
function sendGroupReport(topic, room){
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

  //查询得到本次开车结果并直接展示
  let res = requestGroupingResult(shortCode, topic, room)

  //直接返回文字信息即可
  /**
  var txt = "📈点击查看报告👇\n"+config.sx_wx_api +"/s.html?s="+shortCode+"\n请在列表里查缺补漏哦~~";
  try{
    sendText2Room(room, txt);
  }catch(err){
    console.log("failed send group report.",err);
  }
  //**/
}


//返回置顶互阅列表：直接发送文字及链接
function requestGroupingResult(shortCode,topic, room){  
  //获取topic 
  console.log("try request grouping result. [groupingCode]",config.rooms[topic].grouping.code);

  //默认返回列表结果
  var txt = "📈点击查看明细并补漏👇\n"+config.sx_wx_api2 + shortCode;

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

                    sendText2Room(room, sendtxt);
                    //resolve(sendtxt)

                  } else {
                    console.log("no grouping results found.");
                    //resolve(txt)
                    sendText2Room(room, txt);
                  }
                } else {
                  console.log("error occured while get grouping results.");
                  //resolve(txt);
                  sendText2Room(room, txt);
                }
          })
  })
}

//返回置顶文章列表：直接发送文字及链接
async function sendToppingRead(topic, bot){
    //检查推送时间戳
    if(config.rooms[topic] && (new Date().getTime() - config.rooms[topic].autoPushTimestamp < config.pushDuration) ){
      console.log("push msg too frequent. ignore.");
      return;
    }

    const room = await bot.Room.find({topic: topic}) //get the room by topic
    if(!room)return;
    console.log('try send topping read msg to room ' + room)   

    //需要检查是否有尚未结束互阅车
    if(config.rooms[topic]&&config.rooms[topic].grouping && config.rooms[topic].grouping.timeFrom && config.rooms[topic].grouping.duration ){
      var waitMillis = new Date().getTime() - (config.rooms[topic].grouping.timeFrom.getTime()+config.rooms[topic].grouping.duration);
      if( waitMillis < 0 ){
        //return "当前车次尚未结束，请加入或"+(Math.floor(-1*waitMillis/1000/60))+"分钟后开始";
        return "";
      }
    }
    //需要检查时间离下一个整点是否足够
    var next = new Date();
    next.setHours(next.getHours()+1);
    next.setMinutes(0);
    next.setSeconds(0);
    var spareMillis = next.getTime()-new Date().getTime();
    if(spareMillis<6*60*1000 && spareMillis>0){
      //return "请稍等，"+Math.floor(spareMillis/1000/60)+"分钟后开始";
      return ""
    }

    let res = await requestToppingRead(topic, room)
    try{
      if(res && res.length>0){
        sendText2Room(room, res) 
      }
          
    }catch(err){
      console.log("failed send topping articles.",err);
    }
}

//返回置顶互阅列表：直接发送文字及链接
function requestToppingRead(topic,room){  
  console.log('request topping read msg to room ' + room)  

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
  config.rooms[topic].grouping.name = now.getHours()+"点"+now.getMinutes()+"分合集";

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
                    let sendtxt = "共"+(Math.floor((res.length+config.rooms[topic].grouping.pageSize-1)/config.rooms[topic].grouping.pageSize))+"合集，请阅读报数，格式为：\nA 11 22 33 44 55";//res.data.reply
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
                      sendText2Room(room, boxMsg);
                    }

                    //发送报数提示
                    //sendtxt = sendtxt.replace(/__howlong/,Math.floor(res.length*15/60)>0?(""+Math.floor(res.length*15/60)):"1");
                    //sendtxt = sendtxt.replace(/__howlong/,"5");
                    //sendText2Room(room, sendtxt);

                    //修改推送时间戳
                    config.rooms[topic].autoPushTimestamp = new Date().getTime();

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

//返回互阅列表：直接发送文字及链接
async function sendPaidRead(topic, bot){
    //检查推送时间戳
    if(config.rooms[topic] && (new Date().getTime() - config.rooms[topic].autoPushTimestamp < config.pushDuration) ){
      console.log("push msg too frequent. ignore.");
      return;
    }
        
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    if(!room)return;
    console.log('Sending paid read msg to room ' + room)   

    let res = await requestPaidRead(topic)
    try{
      if(res && res.length>0){
        sendText2Room(room, res) 
        //修改推送时间戳
        config.rooms[topic].autoPushTimestamp = new Date().getTime();        
      }
          
    }catch(err){
      console.log("failed send msg  2 room.",err);
    }
}

//发送有偿阅读列表。需要检查是否有其他互阅。
function requestPaidRead(topic){
  //需要检查是否有尚未结束互阅车
  if(config.rooms[topic]&&config.rooms[topic].grouping && config.rooms[topic].grouping.timeFrom && config.rooms[topic].grouping.duration ){
    var waitMillis = new Date().getTime() - (config.rooms[topic].grouping.timeFrom.getTime()+config.rooms[topic].grouping.duration);
    if( waitMillis < 0 ){
      //return "当前车次尚未结束，请加入或"+(Math.floor(-1*waitMillis/1000/60))+"分钟后开始";
      return "";
    }
  }
  //需要检查时间离下一个整点是否足够
  var next = new Date();
  next.setHours(next.getHours()+1);
  next.setMinutes(0);
  next.setSeconds(0);
  var spareMillis = next.getTime()-new Date().getTime();
  if(spareMillis<6*60*1000){
    //return "请稍等，下一个车次"+(spareMillis/1000/60)+"分钟后开始，请结束后发起";
    return ""
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
  config.rooms[topic].grouping.duration = 10*60*1000;
  config.rooms[topic].grouping.code = groupingCode;
  config.rooms[topic].grouping.page = 0;
  config.rooms[topic].grouping.articles = {};
  config.rooms[topic].grouping.name = now.getHours()+"点"+now.getMinutes()+"分列表";

  //TODO：查询金币文章列表并推送

  //直接返回文字信息即可
  var txt = "TODO 查询金币文章列表并推送";
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

/**
 * 提交登录机器人到后端进行同步
 * 参数包括：
 * oldBotId: 之前启动的botId。可以为空。如果则新建bot
 * botId: 当前botId
 * qrcodeUrl：二维码地址
 */
async function syncBot(bot,user,data) {
    try{
        data = JSON.parse(data);
    }catch(err){
        console.log("failed parse local file content.");
    }    
    console.log("try to sync bot info. ",data);
    let url = config.sx_api+'/wx/wxBot/rest/sync'
    request({
              url: url,
              method: 'POST',
              json:{
                    oldBotId:data&&data.botId?data.botId:"",
                    botId:bot.id,
                    status:"active",
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

    //将当前登录信息及wechatyid写入本地文件，在重启或重新扫码时能够更新wechatyid
    let file = config.localFile;
    //let dataNew = {botId: bot.id}
    data.botId = bot.id;//更新bot id
    // 异步写入数据到文件
    fs.writeFile(file, JSON.stringify(data), { encoding: 'utf8' }, err => {});    
}

/**
 * 根据本地文件同步各个群自动推送offset
 * 本地文件内存储数据为：
 {
  offset:{
    xxx: 12,
    yyy: 2,
    zzz: 7
  }
 }
 */
async function loadOffset(data) {
  /**
    try{
        data = JSON.parse(data);
    }catch(err){
        console.log("failed parse local file content.");
    }    
    console.log("try to sync offset info. ",data);
    Object.keys(config.rooms).forEach(function(topic){
      if(config.rooms[topic].offset==-1){//仅在启动时时检查
        if( data.offset && data.offset[topic]){
          console.log("sync offset..."+topic,data.offset[topic]);
          config.rooms[topic].offset = data.offset[topic];
        }else{
          console.log("init offset...");
          config.rooms[topic].offset = 0;          
        }
      }
    });
    //**/
}
//将offset更新到本地文件
async function syncOffset(topic, offset, data) {
    //topic传递中有可能是buffer，如果为对象则排除
    //当前采用随机抽样，不需要维持offset
    /**
    if(typeof(topic) === "string"){
      try{
          data = JSON.parse(data);
      }catch(err){
          console.log("failed parse local file content.");
      }    
      console.log("try to sync offset info. ",data);
      //将指定topic的offset写入本地文件，在重启或重新扫码时能够继续原有的offset
      let file = config.localFile;
      if(!data.offset)data.offset={};
      try{
        data.offset[topic] = offset;//更新指定topic的offset
        if(data.type)delete data.type;
        if(data.data)delete data.data;
        // 异步写入数据到文件
        fs.writeFile(file, JSON.stringify(data), { encoding: 'utf8' }, err => {});        
      }catch(err){
          console.log("failed save local file.",err);
      }
       
    }else{
      console.log("failed sync offset with topic.",topic);
    }
    //**/

}

//检查是否是图片链接，对于不是图片的则不发送
function isImage(imgUrl){
  if(!imgUrl)return false;
  //return imgUrl.endsWith(".jpg") || imgUrl.endsWith(".jpeg") || imgUrl.endsWith(".png") || imgUrl.endsWith(".jpg");
  //*
  if(imgUrl.endsWith(".jpg") || imgUrl.endsWith(".jpeg") || imgUrl.endsWith(".png") || imgUrl.endsWith(".jpg")){
    //需要判断图片文件是否存在：否则会导致程序直接退出
    return new Promise(function(resolve, reject) {
        var ImgObj = new Image(); //判断图片是否存在
        ImgObj.src = imgUrl;
        ImgObj.onload = function(res) {
            resolve(res);
        }
        ImgObj.onerror = function(err) {
            reject(err)
        }
    }).catch((e) => {}); // 加上这句不会报错（Uncaught (in promise)）    
  }else{
    return false;
  }
  // */
}

/**
 * 发起post请求
 */
async function fetchRemoteAPI(URL, postBody, okCallback, bot) {
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