
import { log } from 'wechaty'
// node-request请求模块包
import request from "request"
// 请求参数解码
import urlencode from "urlencode"
import { FileBox }  from 'file-box'
import md5 from "md5"
import crypto from "crypto"
// 配置文件
import config from "../../config/index.js"


// 机器人名字
const name = config.name
// 管理群组列表
const roomList = config.room.roomList

// 消息监听回调
export const onMessage = bot => {
  return async function onMessage(msg) {
    // 判断消息来自自己，仅响应激活码
    if (msg.self()){
        if(msg.room() && config.magicCode && config.magicCode.trim().length>0 && msg.text() === config.magicCode){
          console.log("got magic code. activate wx group.");
          const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>

          //把room加入本地列表
          config.room.roomList[topic]=msg.room().id;
          //把room提交到后端，等待设置客群及自动任务
          syncRoom(topic, msg.room().id);
          //TODO 重新schedule所有任务：在停止群托管、激活群托管、修改任务规则等均可以发送激活码重新装载任务
        }else{
          //do nothing
          //console.log("自说自话，且不是激活码，直接忽略");
        }      
    }

    //仅处理文本消息
    if (msg.type() == bot.Message.Type.Text) {//打印到控制台
      console.log("=============New  Message================")
      console.log(`msg : ${msg}`)
      console.log(
        `from id: ${msg.talker() ? msg.talker().name() : null}: ${msg.talker() ? msg.talker().id : null
        }`
      )    
      console.log(`to: ${msg.listener()}`)
      console.log(`text: ${msg.text()}`)
      console.log(`room: ${msg.room()}`)
      //console.log("=============End of New Message================")      
    }else{
      console.log("非文本消息，忽略.")
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
          // 获取提到自己的名字
          let self = await msg.listener()
          self = "@" + self.name()
          // 获取消息内容，拿到整个消息文本，去掉 @+名字
          let sendText = msg.text().replace(self, "").replace("找", "").replace("查", "").replace("#", "")

          // 请求机器人接口回复
          let res = await requestRobot(sendText,room)

          // 返回消息，并@来自人: 当前不予处理，由人工自行处理
          room.say(res, msg.talker())
          return
        }else{//根据关键字识别：需要严格判断
          if (msg.text() === 'ding') {
            await msg.say('dong dong',msg.talker())
          }else if (msg.text() === '互阅发车' || msg.text() === '互阅开车' || msg.text() === '互阅车') {//互月发车：推送链接即可
            let res = sendGroupRead(msg);
            await msg.say(res,msg.talker())
          }else if (msg.text() === '互关发车' || msg.text() === '互关开车' || msg.text() === '互关车') {//互关发车：推送链接即可
            let res = sendGroupSubscribe(msg);
            await msg.say(res,msg.talker())
          }else if (msg.text().startsWith('找') || msg.text().startsWith('查') || msg.text().startsWith('#') ) {
            let sendText = msg.text().replace("找", "").replace("查", "").replace("#", "")
            let res = await requestRobot(sendText,room, null)
            msg.say(res, msg.talker())
          }else if(config.rooms[topic] && config.rooms[topic].grouping.code && config.rooms[topic].grouping.timeFrom){//如果有互阅开车会话，则响应报数。需要严格匹配格式
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
        }
      }else{//非托管群仅响应。当前不做响应。对于共享群的情况，可以响应激活码
        console.log("非托管群消息，直接忽略");
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
      if (msg.text().startsWith('找') || msg.text().startsWith('查') || msg.text().startsWith('#') ) {
        let sendText = msg.text().replace("找", "").replace("查", "").replace("#", "")
        let res = await requestRobot(sendText,null,msg)
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
 * @param {String} keyword 发送文字
 * @return {Promise} 相应内容
 */
function requestRobot(keyword, room, msg) {
  console.log("try search. [keyword]",keyword);
  return new Promise((resolve, reject) => {
    let url = config.es_api
    //**
    let postBody = {
                      "from":0,
                      "size":3,      
                      "query": {
                        "query_string": {
                          "query": keyword,
                          "default_field": "full_text"
                        }
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
                  if (res.hits && res.hits.total>0) {
                    //随机组织1-3条，组成一条返回
                    let total = 1;//Math.floor(Math.random() * 3);//取1-4条随机
                    let send = "亲，以下是关于【"+keyword+"】的商品👇";//res.data.reply
                    for (let i = 0; i < res.hits.hits.length && i<total; i++) {
                      var item  = res.hits.hits[i]._source;
                      let text = item.distributor.name+" "+(item.price.currency?item.price.currency:"￥")+item.price.sale+" "+item.title;
                      //let url =  item.link.token?item.link.token:(item.link.wap2?item.link.wap2:item.link.wap);
                      let url =  config.sx_wx_api+"/go.html?id="+item._key;//TODO需要添加 fromBroker信息
                      let logo = item.logo?item.logo: item.images[0]
                      let moreUrl =  config.sx_wx_api+"/index.html?keyword="+encodeURIComponent(keyword);

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
                      if(msg)sendImage2Person(msg, logo);

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
  config.rooms[topic].grouping.name = now.getHours()+"点"+now.getMinutes()+"分列表";

  //设置任务，2分钟后发送列表
  setTimeout(function(){
    requestGroupingArticles(msg);
  },config.rooms[topic].grouping.timeout);

  //直接返回文字信息即可
  var txt = "🚄快车经过，发文加入👇\n"+config.sx_wx_api +"/s.html?s="+shortCode+"\n2分钟自动出合集";
  return txt;
}

//根据grouping code分页加载文章列表，最多发4车
function requestGroupingArticles(msg) {
  //获取topic
  const topic = (""+msg.room()).replace(/Room</,"").replace(/>/,"");//直接获取群聊名称，避免等待加载。获取后格式为： Room<xxxx>  
  console.log("try request grouping articles. [groupingCode]",config.rooms[topic].grouping.code);
  return new Promise((resolve, reject) => {
    let url = config.sx_api+"/wx/wxArticle/rest/grouping-articles?from=0&to=25&openid=&publisherOpenid=&code="+config.rooms[topic].grouping.code
    //**
    let postBody = {
                      "from":0,
                      "to":25, //需要列表进行控制，不能超过20条，此处默认为25条 
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
                    let send = "本车共有"+(Math.floor(res.length/config.rooms[topic].grouping.pageSize)+1)+"节，请逐节阅读，并按以下格式报数：\nA 11 22 33 44 55";//res.data.reply
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
                      let boxMsg = ""+config.rooms[topic].grouping.names[k];
                      let articles = config.rooms[topic].grouping.articles[config.rooms[topic].grouping.names[k]];
                      console.log("got box "+k,articles);
                      for(let j=0;j<articles.length;j++){
                        boxMsg+="\n👉"+articles[j].title;
                        boxMsg+="\n🔗"+articles[j].url;
                      }
                      msg.say(boxMsg, msg.talker());
                    }

                    //设置定时任务推送报告链接，默认按照timeout设置发送
                    setTimeout(function(){
                      sendGroupReport(msg);
                    },config.rooms[topic].grouping.timeout*2);                    

                    // 免费的接口，所以需要把机器人名字替换成为自己设置的机器人名字
                    send = send.replace(/Smile/g, name)
                    resolve(send)
                  } else {
                    resolve("一篇文章都没有，先散了吧，等等再来~~")
                  }
                } else {
                  resolve("啊哦，好像出错了~~")
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

  //直接返回文字信息即可
  var txt = "📈点击查看报告👇\n"+config.sx_wx_api +"/s.html?s="+shortCode+"\n请在列表里查缺补漏哦~~";
  msg.say(txt, msg.talker());
}


//将新激活的群信息同步到后端
function syncRoom(topic, roomId) {
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
                  console.log("sync done.");
                } else {
                  console.log("sync error.")
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
                    resolve("啊哦，需要点击链接扫码关注哦~~")
                  }
                } else {
                  resolve("啊哦，出错了，重发试试呢~~")
                }
          })
  })
}

//扣除阅豆
function costPoints(msg, article,reader,readCount){
  console.log("try to cost points. ",article,reader,readCount);
  /*return*/ new Promise((resolve, reject) => {
    let url = config.sx_api+"/wx/wxArticle/rest/exposure"
    request({
              url: url,
              method: 'POST',
              json:{
                      articleId:article.id,
                      readerOpenid:reader.openid,
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
  var txt = "请进列表👇\n"+config.sx_wx_api +"/s.html?s="+shortCode+"\n可通过「查看报告」获取结果";
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
