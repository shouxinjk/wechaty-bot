/**
    任务处理。机制如下：
    1，每一个任务均为微信群任务。加载的微信群任务为：{topic: 群名称，job:[{task:xxx,cron:xxxx}]}
    2，其中task为固定方法。根据名称指定调用

    时序关系：
    1，机器人启动后将开始启动任务处理，
    2，首先查询该机器人托管的微信群，得到群任务列表
    3，启动定时器。每个任务一个定时器 
    4，在具体任务体中完成数据查询及推送
**/


/**
 * Fetch response from xiaoli API
 * @param URL
 * @param postBody
 * @param okCallback: covert json to msg text when fetch succeeds
 */
export const fetchRemote  = async function fetchRemoteAPI(URL, postBody, okCallback) {
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
        if (resp.ok) {
            // status code = 200, we got it!
            resText = okCallback(resp_json['data'])
        } else {
            // status code = 4XX/5XX, sth wrong with API
            resText = 'API ERROR: ' + resp_json['msg']
        }
    } catch (err) {
        resText = 'NETWORK ERROR: ' + err
    }
    return resText
}