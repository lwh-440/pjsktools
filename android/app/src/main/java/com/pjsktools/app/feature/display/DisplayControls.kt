package com.pjsktools.app.feature.display

import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp

@Composable
internal fun P3Button(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit
) = Button(onClick, modifier.heightIn(min = 48.dp), enabled, shape = MaterialTheme.shapes.small, content = content)

@Composable
internal fun P3OutlinedButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit
) = OutlinedButton(onClick, modifier.heightIn(min = 48.dp), enabled, shape = MaterialTheme.shapes.small, content = content)

@Composable
internal fun P3TextButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    content: @Composable RowScope.() -> Unit
) = TextButton(onClick, modifier.heightIn(min = 48.dp), enabled, shape = MaterialTheme.shapes.small, content = content)

@Composable
internal fun P3OutlinedTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: @Composable (() -> Unit)? = null,
    singleLine: Boolean = false,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailingIcon: @Composable (() -> Unit)? = null
) = OutlinedTextField(
    value = value,
    onValueChange = onValueChange,
    modifier = modifier.heightIn(min = 48.dp),
    label = label,
    singleLine = singleLine,
    visualTransformation = visualTransformation,
    trailingIcon = trailingIcon,
    shape = MaterialTheme.shapes.small
)

@Composable
internal fun P3FilterChip(
    selected: Boolean,
    onClick: () -> Unit,
    label: @Composable () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) = FilterChip(
    selected = selected,
    onClick = onClick,
    modifier = modifier.heightIn(min = 48.dp),
    enabled = enabled,
    label = label,
    shape = MaterialTheme.shapes.small
)
