/**
 * @method onRoomTopic 当有人修改群名称的时候会触发这个事件。
 * @param {*} user 
 */
export const onRoomTopic = async user => {
    try {
        console.log('========================onRoomTopic👇========================')
        console.log(`获取主题事件，当有人改变房间主题时发出。`)
        //rest：rest/changeTopic
        //param：{old:xxx,new:xxx}
    } catch (error) {
        console.log(`onRoomTopic：${error}`)
    }

}

//module.exports = { onRoomTopic }