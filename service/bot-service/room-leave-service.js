// 同步群聊
import { syncRoomInfo } from "../../src/common.js"
// 配置文件
import config from "../../config/index.js"

/**
 * @method onRoomleave 当机器人把群里某个用户移出群聊的时候会触发这个事件。用户主动退群是无法检测到的。
 * @param {*} user 
 */

export const onRoomleave = bot => {
	return async function onRoomleave(user) {
	//export const onRoomleave = async user => {
	    try {
	        console.log('========================onRoomleave👇========================')
	        //判断是否是自己被踢出：注意，该方法当前不能工作。原因在于room的memberIdList中的id与contact的id有时候不一致，当前未能判定原因
	        //方法一：分别获取联系人及群聊
			const contact = await bot.Contact.find({name: config.broker.nickname})   // 判断当前bot代理达人是否在群里，根据昵称查找
			const room = await bot.Room.find({topic: user.payload.topic})         // 在检测到有用户离开的群里进行判断
			//方法二：直接根据昵称查找
			const member = await room.member({name: config.broker.nickname}) //根据昵称直接在群里查找是否有该成员
			//if (contact && room) {
			if (member) {
				console.log(`checking is contact in room.`, config.broker.nickname)
				/**
				if (await room.has(contact)) {
					console.log(`${contact.name()} is in the room ${user.payload.topic}!`)
				} else {
					console.log(`糟糕，被踢出了，需要立即终止自动任务。${contact.name()} was removed from ${user.payload.topic}!`)
				}
				//**/
			}	        
	        //syncRoomInfo(user); 
	    } catch (error) {
	        console.log(`onRoomleave：${error}`)
	    }

	}
}

//module.exports = { onRoomleave }

