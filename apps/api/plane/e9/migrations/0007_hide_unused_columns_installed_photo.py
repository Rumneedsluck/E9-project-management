# Hand-written. Changes no tables or columns:
#   1. adds the "Installed photo" attachment type (a list of allowed values kept in Python only)
#   2. makes "Current stage", "QC by" and "Installed by" hidden by default for new projects
#   3. hides those same three columns on every existing project (one value in a JSON list per project)
# Going back (migrate e9 0006) leaves the hidden columns as they are; show them again from the Columns button.

from django.db import migrations, models

import plane.e9.models

HIDE = ["current_stage", "qc_done_by", "installed_by"]


def hide_unused_columns(apps, schema_editor):
    Profile = apps.get_model("e9", "E9ProjectProfile")
    for profile in Profile.objects.all():
        current = list(profile.hidden_columns or [])
        merged = current + [column for column in HIDE if column not in current]
        if merged != current:
            # .update() keeps the project's "last edited" time untouched
            Profile.objects.filter(pk=profile.pk).update(hidden_columns=merged)


class Migration(migrations.Migration):
    dependencies = [
        ("e9", "0006_certification_jmc_announcements"),
    ]

    operations = [
        migrations.AlterField(
            model_name="e9attachment",
            name="kind",
            field=models.CharField(
                choices=[
                    ("photo", "Photo"),
                    ("site_audit", "Site audit report"),
                    ("dc_scan", "Signed DC"),
                    ("document", "Document"),
                    ("po", "PO / BOQ document"),
                    ("mail", "Client mail / approval"),
                    ("certificate", "Signed certification sheet"),
                    ("pi", "Proforma invoice"),
                    ("wcc", "Work completion certificate"),
                    ("snag", "Snag photo"),
                    ("install_photo", "Installed photo"),
                    ("jmc", "Signed JMC (joint measurement certificate)"),
                ],
                default="photo",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="e9projectprofile",
            name="hidden_columns",
            field=models.JSONField(blank=True, default=plane.e9.models.default_hidden_columns),
        ),
        migrations.RunPython(hide_unused_columns, migrations.RunPython.noop),
    ]
