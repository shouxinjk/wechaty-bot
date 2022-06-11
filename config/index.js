
export default {
    // puppet_padplus Token
    wechatyToken: "puppet_padplu_你申请的token",
    // 接管激活码：仅在接收到激活码之后才响应消息，或推送通知
    activateCode: "letmefly", //TODO 需要通过后台获取，生成后需要直接放置到对应的broker信息上，用于核对。后台会自动生成6位短码
    sx_api: "https://data.shouxinjk.net/ilife/a",//后端访问地址
    es_api: "https://data.pcitech.cn/stuff/_search",//搜索地址
    sx_wx_api: "https://www.biglistoflittlethings.com/ilife-web-wx",//前端地址
    analyze_api:"https://data.shouxinjk.net/clickhouse",//分析数据服务
    magicCode:"",
    // 房间/群聊
    room: {
        // 管理群组列表：TODO 需要调整为从服务器端获取。仅获取已经激活的微信群。
        roomList: {
            // 群名(用于展示，最好是群名，可随意) : 群id(这个可不能随意)
            内部运营小组: "@@490168cc48e88fc024298ec9701820a20999091fda694692b46fe068f4383464",
            sx临时群: "@@121e6e6bc47feef9ce4e48a4cac15f9848a690571c96b5d328cd762f24dc8c3b"
        },
        // 加入房间回复: TODO 需要调整为后台设置
        roomJoinReply: ` 欢迎进群。输入 找XX 就可以找到相关的商品哦 😊😊`
    },
    // 互阅会话：记录互阅历史，能够对当前的互阅列表进行互动。互阅开始时填充articles，下一轮互阅将更新所有数据
    grouping:{
        label:null,//用于显示到群里的标签，是时间标记，如7点班车，车厢为A、B、C
        code:null,//标记互阅分组code，6位短码
        timeFrom: null,//开始时间
        duration: 10*60*1000, //一次互阅任务持续时长。默认为10分钟
        pageSize: 5,//每页文章数
        timeout: 2*60*1000,//发送两页之间时间间隔，默认为2分钟，最低为500毫秒

    },
    articles:{},//记录当前互阅文章列表。结构为： {a:[文章列表],b:[文章列表]}
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
    dingNotificationLoginInformationUrl: '钉钉通知接口地址，可以去钉钉申请'
}
