/**
 * @method onHeartbeat 获取机器人的心跳。
 * @param {*} user 
 */

export const onHeartbeat = bot => { 
	return async user => {
	    try {
	        console.log('========================onHeartbeat👇========================')
	        console.log('获取机器人的心跳。bot.id='+bot.id)
	    } catch (error) {
	        console.log(`onHeartbeat：${error}`)
	    }

	}
}

//module.exports = { onHeartbeat }