/**
 * @method onRoomleave 当机器人把群里某个用户移出群聊的时候会触发这个时间。用户主动退群是无法检测到的。
 * @param {*} user 
 */
export const onRoomleave = async user => {
    try {
        console.log('========================onRoomleave👇========================')
        console.log(`有人离开群聊。TODO：同步群人数`,user)
    } catch (error) {
        console.log(`onRoomleave：${error}`)
    }

}

//module.exports = { onRoomleave }