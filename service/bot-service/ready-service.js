/**
 * @method onReady 当所有数据加载完成后，会触发这个事件。在wechaty-puppet-padchat 中，它意味着已经加载完成Contact 和Room 的信息。
 */
export const onReady = async () => {
    try {
        console.log('========================👉onReady👈========================')
        console.log(`当所有数据加载完成时，在微信-木偶-padchat中，意味着它完成了同步联系和房间`)
        //注意：加载完成后不做任何事情，群激活需要达人发送激活码才完成。
        //逻辑：达人选择开通小助手后生成识别码，需要在扫码登录后在需要托管的群内发送此识别码，然后才激活消息响应及自动推送
    } catch (error) {
        console.log('onReady', error)
    }
}

//module.exports = { onReady }