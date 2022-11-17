
export default {
    // REST API
    sx_api: "https://data.shouxinjk.net/ilife/a",//后端访问地址
    es_api: "https://data.pcitech.cn/stuff/_search",//搜索地址
    sx_wx_api: "https://www.biglistoflittlethings.com/ilife-web-wx",//前端地址：支持原始链接地址，带有path
    sx_wx_api2: "https://www.biglistoflittlethings.com/",//前端地址：支持短码
    wechat_cp_api:"https://www.biglistoflittlethings.com/ilife-wework",//wechat cp企业微信服务端
    analyze_api:"https://data.shouxinjk.net/clickhouse",//分析数据服务
    magicCode:"方便浏览文章并开白转载__群里将不定期分享好物__不定期分享好物__个性化定制__消费决策服务__个性化推荐",// 接管激活码：采用__分隔多个，匹配一个即可。仅在接收到激活码之后才响应消息，或推送通知。由后台生成，生成后需要直接放置到对应的broker信息上，用于核对。后台会自动生成6位短码
    broker:{},//同步后缓存达人信息。包含激活码。
    localFile:"./ilife.json",//本地缓存botid信息文件。包括botId及offset。其中offset结构为{xxx:xx}，xxx为群聊topic，xx为指定群对应推送offset
    groupingDuration:5*60*60*1000,//在接收到信息回复引流消息时间间隔
    pushDuration:3*60*1000,//连续主动推送时间间隔：默认3分钟
    pushRandom:10*60*1000,//推送任务最长延迟分钟数：为了让推送任务时间随机，在固定设置的cron基础上，增加一个随机延后时间，默认为0-8分钟
    // 房间/群聊
    room: {
        // 管理群组列表：TODO 需要调整为从服务器端获取。仅获取已经激活的微信群。
        roomList: {
            // 群名(用于展示，最好是群名，可随意) : 群id(这个可不能随意)
            // "👀发现小确幸": "24183031339@chatroom",
            "sx临时群": "@@121e6e6bc47feef9ce4e48a4cac15f9848a690571c96b5d328cd762f24dc8c3b"
        },
        // 加入房间回复: TODO 需要调整为后台设置
        roomJoinReply: ` 欢迎进群。请关注 #小确幸大生活 ，你的专属推荐、评价、定制服务，输入 找XX 可以找到想要的东东哦 😊😊`
    },
    rooms:{},//记录群内活动明细，包括grouping、商品推送等,key为群名称，其结构为groupingTemplate
    //文章列表标志：
    numbers:["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"],
    // 群聊会话模板
    groupingTemplate:{
        fromBroker:"system",//记录所属brokerId，为指定微信群主
        fromUser:"o8HmJ1ItjXilTlFtJNO25-CAQbbg",//记录所属user Openid
        offset:-1,//记录关键词商品offset
        featuredOffset:0,//记录主推商品offset
        autoReplyTimestamp: new Date().getTime(),//0,//记录群内互阅通知发送时间戳：根据收到的信息自动回复
        autoPushTimestamp:0,//记录群内推送消息时间戳：在多个任务推送时，需要设置时间戳避免重叠冲突
        grouping:{// 互阅会话：记录互阅历史，能够对当前的互阅列表进行互动。互阅开始时填充articles，下一轮互阅将更新所有数据
            names:["A","B","C","D","E"],//用于显示到群里的标签，是时间标记，如7点班车，车厢为A、B、C。默认最多5节
            code:null,//标记互阅分组code，6位短码
            timeFrom: null,//开始时间
            duration: 10*60*1000, //一次互阅任务持续时长。默认为10分钟
            pageSize: 10,//每页文章数
            timeout: 2*60*1000,//发送两页之间时间间隔，默认为2分钟，最低为500毫秒

        },
        articles:{}//记录当前互阅文章列表。结构为： {a:[文章列表],b:[文章列表]}
    },
    currency:{
        "$":"💵",
        "￥":" "
    },
    // 私人 ：当前忽略
    personal: {
        // 好友验证自动通过关键字
        addFriendKeywords: ["加群", "好物", "定制", "推荐", "评价"],
        // 是否开启加群
        addRoom: true
    },
    /**
     * 钉钉相关配置
     */
    dingNotificationLoginInformationUrl: '钉钉通知接口地址，可以去钉钉申请',
    //推荐时的广告语
    tips:[
        "号主交流支持：提供文章发布和开白申请，方便交流内容并转载。进入 #小确幸大生活 流量主后台可以看到~~",
        "便捷的开白申请：为了让好文章让更多人看到，支持号主申请转载，转载文章带有公众号卡片，能够互推吸粉哦~~",
        "确幸评分已上线，能够对各类商品提供客观评价，不仅仅是价格和好评哦，还有更多方面，即使不了解也能清楚知道这货怎么样。#小确幸大生活 ",
        "新功能上线：可以快速个性化定制了哦。无论是旅游行程，还是服装穿搭，或者是体检方案，都可以简单组合得到你的专属方案，也方便和好友共同完成属于你们的计划。 #小确幸大生活 ",
        "新功能发布，客观评分系统支持查询商品名称、类目名称，或者任意内容，不仅能够得到评分规则，还能得到实时排行榜，进入 #小确幸大生活 ~~",
        "团队能力：三个臭皮匠赛过诸葛亮，我们提供了团队功能，可以进入 #小确幸大生活 团队界面邀请加入，团队有订单，都可以收到相应的佣金，收益更大哦~~",
        "内容带货功能，方便在文章里嵌入商品得到推广佣金。并且提供有图文物料，能够直接在公众号文章里嵌入，让粉丝所读即所得，下单就会有佣金哦~~",
        "邀请奖励阅豆：能够邀请公众号主加入，每邀请一次奖励20阅豆，同时也将享有更多带货佣金收益"
    ],
}
