package com.pjsktools.app.feature.compliance

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.pjsktools.app.R

const val PRIVACY_URL = "https://sekai-tools.cn/privacy"
const val TERMS_URL = "https://sekai-tools.cn/terms"
const val SECURITY_URL = "https://sekai-tools.cn/security"
const val ICP_URL = "https://beian.miit.gov.cn/"
const val POLICE_FILING_URL = "https://beian.mps.gov.cn/#/query/webSearch?code=44011302005743"
const val ICP_NUMBER = "粤ICP备2026103933号"
const val POLICE_FILING_NUMBER = "粤公网安备44011302005743号"

@Composable
fun ComplianceLinks(
    modifier: Modifier = Modifier,
    includeFilings: Boolean = true
) {
    val uriHandler = LocalUriHandler.current
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Row(horizontalArrangement = Arrangement.Center) {
            TextButton(onClick = { uriHandler.openUri(PRIVACY_URL) }) { Text("隐私政策") }
            TextButton(onClick = { uriHandler.openUri(TERMS_URL) }) { Text("用户协议") }
            TextButton(onClick = { uriHandler.openUri(SECURITY_URL) }) { Text("安全与举报") }
        }
        if (includeFilings) {
            TextButton(onClick = { uriHandler.openUri(POLICE_FILING_URL) }) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Image(
                        painter = painterResource(R.drawable.beian_mps_badge),
                        contentDescription = "公安备案图标",
                        modifier = Modifier.size(18.dp)
                    )
                    Text(POLICE_FILING_NUMBER)
                }
            }
            TextButton(onClick = { uriHandler.openUri(ICP_URL) }) { Text(ICP_NUMBER) }
        }
        Text(
            "隐私与安全联系：privacy@sekai-tools.cn · security@sekai-tools.cn",
            style = MaterialTheme.typography.bodySmall,
            textAlign = TextAlign.Center
        )
    }
}
