package com.pjsktools.app.core

/** Navigation contract mirrored from the web application's navGroups. */
enum class AppSection(val label: String, val group: String) {
    HOME("工具台", "核心工具"), CURRENT_EVENT("当前分数线", "核心工具"),
    FORECAST("预测线", "核心工具"), TOOLS("计算工具", "核心工具"),
    DECK_COMPARE("卡组比较", "核心工具"), SHARE("分享卡", "核心工具"),
    SONGS("歌曲", "图鉴资料"), CARDS("卡牌", "图鉴资料"),
    GACHAS("卡池", "图鉴资料"), HONORS("称号", "图鉴资料"),
    MATERIALS("素材", "图鉴资料"), COSTUMES("服装", "图鉴资料"),
    STAMPS("贴图/漫画", "图鉴资料"), PROFILE("玩家档案", "玩家数据"),
    HISTORY_EVENTS("往期活动", "玩家数据"), ACCOUNT("个人信息管理", "玩家数据"),
    INFORMATION("公告资讯", "内容资料"), EXCHANGES("兑换所", "内容资料"),
    MISSIONS("任务", "内容资料"), VIRTUAL_LIVES("虚拟 Live", "内容资料"),
    LIVE2D("Live2D", "内容资料"), MYSEKAI("MySekai", "内容资料"),
    STORIES("故事", "内容资料"), SETTINGS("设置", "项目"), ABOUT("关于", "项目");

    companion object { val grouped = entries.groupBy(AppSection::group) }
}
