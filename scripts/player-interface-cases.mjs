export const playerInterfaceCases = [
  { region: "jp", uid: "5275224799551492", role: "ranking", baseline: { eventId: "210", rank: 1 } },
  { region: "jp", uid: "6071578286620673", role: "ranking", baseline: { eventId: "210", rank: 2 } },
  { region: "jp", uid: "6214975090094081", role: "ranking", baseline: { eventId: "210", rank: 5 } },
  { region: "en", uid: "303653174110265345", role: "ranking", baseline: { eventId: "172", rank: 1 } },
  { region: "en", uid: "338328463226298372", role: "ranking", baseline: { eventId: "172", rank: 2 } },
  { region: "en", uid: "402178256830357507", role: "ranking", baseline: { eventId: "172", rank: 3 } },
  { region: "cn", uid: "7485929717040896807", role: "suite", baseline: { profileExpected: "not-found" } },
  { region: "cn", uid: "7485933994513767206", role: "suite", baseline: { profileExpected: "not-found" } },
  {
    region: "tw",
    uid: "7016857971942775553",
    role: "source-gap",
    source: "https://www.reddit.com/r/ProjectSekai/comments/1ptpzjd/are_there_any_tw_server_players_here/",
    referenceProject: "Moesekai (Haruki Suite public data dependency)",
    baseline: { profileExpected: "not-found", suiteExpected: "not-found" }
  },
  {
    region: "tw",
    uid: "7571308383036070661",
    role: "source-gap",
    source: "https://www.reddit.com/r/ProjectSekai/comments/1q35hgc/plz_i_need_advice_to_download_tw_server/",
    referenceProject: "Moesekai (Haruki Suite public data dependency)",
    baseline: { profileExpected: "not-found", suiteExpected: "not-found" }
  },
  {
    region: "kr",
    uid: "7392163554549390081",
    role: "source-gap",
    source: "https://www.hoyolab.com/article/33438022",
    referenceProject: "Moesekai (Haruki Suite public data dependency)",
    baseline: { profileExpected: "not-found", suiteExpected: "not-found" }
  },
  {
    region: "kr",
    uid: "7120718283975990018",
    role: "source-gap",
    source: "https://www.hoyolab.com/article/33438022",
    referenceProject: "Moesekai (Haruki Suite public data dependency)",
    baseline: { profileExpected: "not-found", suiteExpected: "not-found" }
  }
];

export const rankingRegions = ["jp", "en", "tw", "kr"];
export const suiteCases = playerInterfaceCases.filter((item) => item.role === "suite");
