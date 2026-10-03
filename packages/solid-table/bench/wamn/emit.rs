//! Emit isolated browser inputs through WAMN's actual fixture and client plan.
use std::path::PathBuf;

use anyhow::{Context, Result};
use serde_json::json;
use wamn_schema_generator::client_component::emit_ts_components;
use wamn_schema_generator::client_plan::ClientPlan;
use wamn_schema_generator::client_ts::{emit_ts_client, to_camel};

mod fixture {
    include!(env!("WAMN_FIXTURE_RS"));
}

fn main() -> Result<()> {
    let output = PathBuf::from(std::env::var("WAMN_OUTPUT")?);
    let release = fixture::client_release();
    let plan = ClientPlan::from_ir(&release);
    let screen = plan
        .models
        .iter()
        .flat_map(|model| &model.screens)
        .find(|screen| screen.model == "widget" && screen.name == "query")
        .context("the WAMN fixture must declare Widget query")?;
    let record = screen
        .record
        .context("Widget query must name its primary key")?;
    let paging = screen
        .paging
        .as_ref()
        .context("Widget query must declare paging")?;
    let definition = json!({
        "operation": screen.contract.operation,
        "rowId": to_camel(record.key_field),
        "columns": screen.columns.iter().map(|field| json!({
            "id": to_camel(&field.path),
            "label": field.label.clone().unwrap_or_else(|| field.path.replace('_', " ")),
            "type": field.type_name,
            "revision": field.revision,
        })).collect::<Vec<_>>(),
        "limit": paging.limit,
        "sort": paging.sort,
        "filters": paging.filters,
        "references": screen.resolved_columns.iter().map(|column| json!({
            "column": to_camel(column.column),
            "operation": column.read_operation,
            "displayField": to_camel(column.display_field),
        })).collect::<Vec<_>>(),
        "rowLinks": screen.row_links.iter().map(|link| link.operation).collect::<Vec<_>>(),
        "rowForms": screen.row_forms.iter().map(|form| json!({
            "operation": form.operation,
            "pairs": form.pairs.iter().map(|(field, input)| [to_camel(field), to_camel(input)]).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
    });
    std::fs::create_dir_all(&output)?;
    std::fs::write(
        output.join("definition.json"),
        serde_json::to_vec_pretty(&definition)?,
    )?;
    let mut files = emit_ts_client(&release).context("emit WAMN bindings")?;
    files.extend(emit_ts_components(&plan).context("emit WAMN components for provenance")?);
    for file in files {
        let name = std::path::Path::new(file.path()).strip_prefix("generated/client-ts")?;
        let path = output.join(name);
        std::fs::create_dir_all(path.parent().context("generated file parent")?)?;
        std::fs::write(path, file.bytes())?;
    }
    Ok(())
}
