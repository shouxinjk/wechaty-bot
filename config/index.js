
export default {
    // puppet_padplus Token
    wechatyToken: "puppet_padlocal_7536a45e0cc54cbe90728c7c0e9ec384",
    // REST API
    sx_api: "https://data.shouxinjk.net/ilife/a",//后端访问地址
    es_api: "https://data.pcitech.cn/stuff/_search",//搜索地址
    sx_wx_api: "https://www.biglistoflittlethings.com/ilife-web-wx",//前端地址
    analyze_api:"https://data.shouxinjk.net/clickhouse",//分析数据服务
    magicCode:"",// 接管激活码：仅在接收到激活码之后才响应消息，或推送通知。由后台生成，生成后需要直接放置到对应的broker信息上，用于核对。后台会自动生成6位短码
    broker:{},//同步后缓存达人信息。包含激活码。
    localFile:"./ilife.json",//本地缓存botid信息文件。
    groupingGroups:[],//支持自动回复grouping的群列表
    groupingTimestamp:0,//互阅通知发送时间戳
    groupingDuration:60*60*1000,//连续发送通知的间隔时间
    // 房间/群聊
    room: {
        // 管理群组列表：TODO 需要调整为从服务器端获取。仅获取已经激活的微信群。
        roomList: {
            // 群名(用于展示，最好是群名，可随意) : 群id(这个可不能随意)
            // "👀发现小确幸": "24183031339@chatroom",
            "sx临时群": "@@121e6e6bc47feef9ce4e48a4cac15f9848a690571c96b5d328cd762f24dc8c3b"
        },
        // 加入房间回复: TODO 需要调整为后台设置
        roomJoinReply: ` 欢迎进群。输入 找XX 就可以找到相关的商品哦 😊😊`
    },
    rooms:{},//记录群内活动明细，包括grouping、商品推送等,key为群名称，其结构为groupingTemplate
    // 群聊会话模板
    groupingTemplate:{
        fromBroker:"system",//记录所属brokerId，为指定微信群主
        fromUser:"o8HmJ1ItjXilTlFtJNO25-CAQbbg",//记录所属user Openid
        offset:0,//记录关键词商品offset
        featuredOffset:0,//记录主推商品offset
        grouping:{// 互阅会话：记录互阅历史，能够对当前的互阅列表进行互动。互阅开始时填充articles，下一轮互阅将更新所有数据
            names:["A","B","C","D","E"],//用于显示到群里的标签，是时间标记，如7点班车，车厢为A、B、C。默认最多5节
            code:null,//标记互阅分组code，6位短码
            timeFrom: null,//开始时间
            duration: 10*60*1000, //一次互阅任务持续时长。默认为10分钟
            pageSize: 5,//每页文章数
            timeout: 2*60*1000,//发送两页之间时间间隔，默认为2分钟，最低为500毫秒

        },
        articles:{}//记录当前互阅文章列表。结构为： {a:[文章列表],b:[文章列表]}
    },
    // 私人 ：当前忽略
    personal: {
        // 好友验证自动通过关键字
        addFriendKeywords: ["加群", "好物"],
        // 是否开启加群
        addRoom: true
    },
    /**
     * 钉钉相关配置
     */
    dingNotificationLoginInformationUrl: '钉钉通知接口地址，可以去钉钉申请',
    //推荐时的广告语
    tips:[
        "碎片时间阅读，效果更好",
        "对等阅读，不需要爬楼，节省时间输出好内容",
        "排序规则：文章或公众号按阅豆多少排序，阅豆越多越靠前，阅豆小于0会暂时不显示",
        "也可以在群里发起互阅，输入：互阅开车 就可以哦~~",
        "10秒阅读要求，每小时阅读20篇，有时间就可以读几篇",
        "在阅读文章后还可以申请转载，申请后对方会立即收到通知，对方开白后也会立即发送通知",
        "文章发表后也要同步进入列表让更多人看到哦~~",
        "阅读和被阅读都通过阅豆统计，阅读一次奖励2阅豆，被阅读一次消耗2阅豆，对等阅读更轻松",
        "邀请加入还有阅豆奖励哦，每邀请一次奖励20阅豆",
        "每天阅读超过50篇也会额外奖励阅豆哦~~",
        "关于开白：为了让好文章让更多人看到，支持号主申请转载，转载文章带有公众号卡片，能够互推吸粉哦~~",
        "文章提示：仅支持公众号文章，其他文章不支持哦，发布的时候会提示的",
        "关于阅豆：每次阅读奖励2阅豆，被阅读消耗2阅豆；每次关注奖励5阅豆，被关注消耗5阅豆",
        "阅读提示：可以进入数据查看阅我和粉我数据，优先回阅回粉哦~~",
        "带货功能：系统有带货功能，提供有图文物料，进入后会转换为自己专属的链接或二维码，能够在文章嵌入，让粉丝所读即所得，下单就会有佣金收入的哦~~",
        "团队能力：能够邀请公众号主加入，每邀请一次奖励20阅豆，同时也将享有更多带货佣金收益"
    ],
}
