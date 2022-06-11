import fetch from 'node-fetch'
import schedule from 'node-schedule'
import md5 from "md5"
import crypto from "crypto"
import request from "request"
import { FileBox }  from 'file-box'
// 配置文件
import config from "../../config/index.js"
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

            //TODO 加载群任务，并实例化
            //scheduleSendMessage(bot,user);
            scheduleSendGroupRead(bot,user);

            //登录后将bot的id同步到后台：注意，此处不严格。后端达人数据为openid及nickname，此处为wechatid及nickname，只能通过nickname进行匹配
            await syncBotStatus(bot,user);

            //TODO：加载系统任务：能够定期轮询（如每半小时），查询托管群及任务详情。如有变化则取消所有任务后重新加载
            //当前可通过达人退出登录后重新登录完成任务重新加载。无需自动任务。作为一项使用提示。

            //加载群任务，并实例化
            await loadJobs(bot,user);               
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
    schedule.scheduleJob('0 */5 * * * ?', function(){sendFeature(topic,bot)}); //send every 5 min  
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
 * 提交登录机器人账号信息到后端进行同步
 */
async function syncBotStatus(bot,user) {
    try {
        let resp = await fetch(
            config.sx_api+'/wx/wxBot/rest/sync',
            {
                method: "POST",
                body: JSON.stringify({
                    nickname:user.name,
                    wechatId:user.id,
                    status:"active"
                }), 
            }
        )
        let resp_json = await resp.json()
        if (resp.success) {
            console.log("sync bot succeed.");
        } else {
            console.log("sync bot failed.");
        }
    } catch (err) {
       console.log("sync bot error.");
    }
}

/**
 * 根据登录用户ID查询托管的微信群，并加载自动任务
 * 采用POST方法，返回JSON：{success:true/false,data:[{roomId:xxx,topic:xxx,cron:xxx,task:xxx}]}
 */
async function loadJobs(bot,user) {
    let searchURL = config.sx_api+'/wx/wxGroup/rest/groups'
    let postBody = {
        "wechatId": user.id
    }
    let okCallback = scheduleJobs
    let resText = await fetchRemoteAPI(searchURL, postBody, okCallback, bot)
    return resText
}

/**
 * 解析返回的任务并启动定时器
 * 参数：
 * bot：在回调中带入
 * data：web请求返回的数据
 */
async function scheduleJobs(bot,jsondata) {
    if (jsondata.data.length === 0) {
        console.log("没有待加载任务");
        return;
    }
    for (let i = 0; i < jsondata.data.length; i++) {
        var job  = jsondata.data[i];
        //加载群聊
        const room = bot.Room.load(job.roomId)
        await room.sync()
        //分别加载任务
        if(job.task == "sendItem"){//根据关键词逐条发送
            schedule.scheduleJob(job.cron, function(){sendItem(job.topic, bot)}); //推送商品：标题、来源、价格、首图、链接。注意：链接只能发裸链
        }else if(job.task == "sendFeature"){//发送主推(feature)商品
            schedule.scheduleJob(job.cron, function(){sendFeature(job.topic, bot)}); //推送主推商品：能够将最近添加的feature商品推送到
        }else if(job.task == "sendGroupRead"){
            schedule.scheduleJob(job.cron, function(){sendGroupRead(job.topic, bot)}); //推送互阅开车信息
        }else if(job.task == "sendPaidRead"){
            schedule.scheduleJob(job.cron, function(){sendPaidRead(job.topic, bot)}); //推送有偿阅读链接：查询金币文章，并推送到指定群
        }else{
            //do nothing
            console.log("Unkown job.");
        }
        
    }
}

/**
 * send message
 */
async function sendMessage(topic,bot) {
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    console.log('Sending daily to room ' + room.id)
    //发送文字
    let txtMsg = "该交周报了，没交的话，我隔5分钟来问一次";
    room.say(txtMsg)
    //发送图片
    let imageMsg = FileBox.fromUrl('https://www.biglistoflittlethings.com/static/logo/distributor/ilife.png')
    room.say(imageMsg)    
}

/**
 * send text message
 * test 
 */
async function sendText(topic,bot) {
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    console.log('Sending daily to room ' + room.id)
    //let dailyText = await getDaily()
    let dailyText = "该交周报了，没交的话，我隔5分钟来问一次";
    room.say(dailyText)
}

/**
 * send url message 
 * test 
 * 注意：仅pad协议支持，web协议不支持
 */
async function sendUrl(topic,bot) {
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    console.log('Sending daily to room ' + room.id)
    //let dailyText = await getDaily()
    let dailyText = new bot.UrlLink({
      description: '周报填写链接，没交的赶快填写',
      thumbnailUrl: 'https://www.biglistoflittlethings.com/static/logo/distributor/ilife.png',
      title: '交周报',
      url: 'https://www.baidu.com',
    });
    room.say(dailyText)
}

/**
 * send image to room
 */
async function sendImage2Room(room, imgUrl) {
    console.log('Sending msg to room ' + room.id)
    //发送图片
    let imageMsg = FileBox.fromUrl(imgUrl)
    room.say(imageMsg) 
}

/**
 * send image message 
 * test
 */
async function sendImage(topic,bot) {
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    console.log('Sending daily to room ' + room.id)
    //let dailyText = await getDaily()
    const dailyText = FileBox.fromUrl('https://www.biglistoflittlethings.com/static/logo/distributor/ilife.png')
    room.say(dailyText)
}

/**
 * send item
 * 根据关键字搜索商品，并推送
 */
var offset = 0;
async function sendItem(topic,bot) {
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    console.log('Sending item to room ' + room.id)
    //根据设置的关键字构建query
    let query = {
                      "from":offset,
                      "size":3,      
                      "query": {
                        "query_string": {
                          "query": "*",
                          "default_field": "full_text"
                        }
                      }
                    }    
    //发送文字
    let res = await requestItem(query,room)
    room.say(res)    
}

/**
 * 根据条件查询商品信息并推送
 * 支持应用侧设置搜索条件
 * 参数：
 * queryJson: 组织好的查询条件
 */
function requestItem(queryJson, room) {
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
                  if (res.hits && res.hits.total>0) {
                    //随机组织1-3条，组成一条返回
                    let total = 1;//Math.floor(Math.random() * 3);//取1-4条随机
                    let send = "好物推荐：";//res.data.reply
                    for (let i = 0; i < res.hits.hits.length && i<total; i++) {
                      var item  = res.hits.hits[i]._source;
                      let text = item.distributor.name+" "+(item.price.currency?item.price.currency:"￥")+item.price.sale+" "+item.title;
                      //let url =  item.link.token?item.link.token:(item.link.wap2?item.link.wap2:item.link.wap);
                      let url =  config.sx_wx_api+"/go.html?id="+item._key;//TODO需要添加 fromBroker信息
                      let logo = item.logo?item.logo: item.images[0]
                      let moreUrl =  config.sx_wx_api+"/index.html";
                      if(queryJson.query&&queryJson.query.query_string&&queryJson.query.query_string.query&&queryJson.query.query_string.query.trim().length>1)moreUrl+="?keyword="+encodeURIComponent(queryJson.query.query_string.query);

                      //获得短网址：单个item地址
                      let eventId = crypto.randomUUID();
                      let itemKey = item._key;
                      let fromBroker = "system";//TODO 需要替换为当前达人
                      let fromUser = "bot";//固定为机器人
                      let channel = "wechat";
                      let shortCode = generateShortCode(url);
                      saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,url,shortCode);
                      let url_short = config.sx_wx_api +"/s.html?s="+shortCode;

                      //获得短网址：更多items地址
                      eventId = crypto.randomUUID();
                      itemKey = "page_"+eventId
                      shortCode = generateShortCode(moreUrl);
                      saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,moreUrl,shortCode);
                      let moreUrl_short = config.sx_wx_api +"/s.html?s="+shortCode;

                      send += "\n"+text +" "+url_short;
                      send += "\n\n更多请点击👉"+moreUrl_short;
                      
                      //推送图片及文字消息
                      if(room)sendImage2Room(room, logo);

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
                      offset ++;                    

                    }
                    // 免费的接口，所以需要把机器人名字替换成为自己设置的机器人名字
                    send = send.replace(/Smile/g, name)
                    resolve(send)
                  } else {
                    offset=0;//重新发起搜索
                  }
                } else {
                  offset=0;//重新发起搜索
                }
          })
  })
}


/**
 * send feature
 * 查询主推商品，通过featuredTimestamp记录更新的时间戳
 */
var featuredTimestamp = new Date();//默认为当前时间，重新启动后从当前时间开始推送
var featuredOffset = 0;
async function sendFeature(topic,bot) {
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    console.log('Sending featured item to room ' + room.id)
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
              "from":featuredOffset,
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
    let res = await requestFeature(query,room)
    if(res && res.length>"好物推荐：".length)
        room.say(res)    
}

/**
 * 根据条件查询商品信息并推送
 * 支持应用侧设置搜索条件
 * 参数：
 * queryJson: 组织好的查询条件
 */
function requestFeature(queryJson, room) {
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
                  if (res.hits && res.hits.total>0) {
                    //随机组织1-3条，组成一条返回
                    let total = 1;//Math.floor(Math.random() * 3);//取1-4条随机
                    let send = "好物推荐：";//res.data.reply
                    for (let i = 0; i < res.hits.hits.length && i<total; i++) {
                      var item  = res.hits.hits[i]._source;
                      let text = item.distributor.name+" "+(item.price.currency?item.price.currency:"￥")+item.price.sale+" "+item.title;
                      //let url =  item.link.token?item.link.token:(item.link.wap2?item.link.wap2:item.link.wap);
                      let url =  config.sx_wx_api+"/go.html?id="+item._key;//TODO需要添加 fromBroker信息
                      let logo = item.logo?item.logo: item.images[0]
                      let moreUrl =  config.sx_wx_api+"/index.html";
                      if(queryJson.query&&queryJson.query.query_string&&queryJson.query.query_string.query&&queryJson.query.query_string.query.trim().length>1)moreUrl+="?keyword="+encodeURIComponent(queryJson.query.query_string.query);

                      //获得短网址：单个item地址
                      let eventId = crypto.randomUUID();
                      let itemKey = item._key;
                      let fromBroker = "system";//TODO 需要替换为当前达人
                      let fromUser = "bot";//固定为机器人
                      let channel = "wechat";
                      let shortCode = generateShortCode(url);
                      saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,url,shortCode);
                      let url_short = config.sx_wx_api +"/s.html?s="+shortCode;

                      //获得短网址：更多items地址
                      eventId = crypto.randomUUID();
                      itemKey = "page_"+eventId
                      shortCode = generateShortCode(moreUrl);
                      saveShortCode(eventId,itemKey,fromBroker,fromUser,channel,moreUrl,shortCode);
                      let moreUrl_short = config.sx_wx_api +"/s.html?s="+shortCode;

                      send += "\n"+text +" "+url_short;
                      send += "\n\n更多请点击👉"+moreUrl_short;
                      
                      //推送图片及文字消息
                      if(room)sendImage2Room(room, logo);

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
                      featuredOffset ++;                    

                    }
                    // 免费的接口，所以需要把机器人名字替换成为自己设置的机器人名字
                    send = send.replace(/Smile/g, name)
                    resolve(send)
                  } else {
                    featuredOffset=0;//重新发起搜索
                  }
                } else {
                  featuredOffset=0;//重新发起搜索
                }
          })
  })
}


//返回互阅列表：直接发送文字及链接
async function sendGroupRead(topic, bot){
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    console.log('Sending group read msg to room ' + room.id)   

    let res = requstGroupRead()
    if(res && res.length>0)
        room.say(res) 
}


//返回互阅列表：直接发送文字及链接
function requstGroupRead(){  
  //需要检查是否有尚未结束互阅车
  if(config.grouping && config.grouping.timeFrom && config.grouping.duration ){
    var waitMillis = new Date().getTime() - (config.grouping.timeFrom.getTime()+config.grouping.duration);
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
  config.grouping.timeFrom = new Date();
  config.grouping.duration = 10*60*1000;
  config.grouping.code = groupingCode;
  config.grouping.page = 0;
  config.grouping.articles = {};
  config.grouping.name = now.getHours()+"点"+now.getMinutes()+"分列表";

  //直接返回文字信息即可
  //TODO 先发送一个通知图片
  var txt = "请将文章加入列表👇\n"+config.sx_wx_api +"/s.html?s="+shortCode+"\n2分钟后自动出合集";
  return txt;
}

//返回互阅列表：直接发送文字及链接
async function sendPaidRead(topic, bot){
    const room = await bot.Room.find({topic: topic}) //get the room by topic
    console.log('Sending paid read msg to room ' + room.id)   

    let res = await requestPaidRead()
    if(res && res.length>0)
        room.say(res) 
}

//发送有偿阅读列表。需要检查是否有其他互阅。
function requestPaidRead(){
  //需要检查是否有尚未结束互阅车
  if(config.grouping && config.grouping.timeFrom && config.grouping.duration ){
    var waitMillis = new Date().getTime() - (config.gourping.timeFrom.getTime()+config.grouping.duration);
    if( waitMillis > 60*1000 ){
      //return "当前车次尚未结束，请加入或"+(waitMillis/1000/60)+"分钟后开始";
      return ""
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
  config.grouping.timeFrom = new Date();
  config.grouping.duration = 5*60*1000;
  config.grouping.code = groupingCode;
  config.grouping.page = 0;
  config.grouping.articles = {};
  config.grouping.name = now.getHours()+"点"+now.getMinutes()+"分文章列表";

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