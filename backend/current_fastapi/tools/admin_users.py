from pathlib import Path
import sys

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.repositories.security_repository import SecurityRepository  # noqa: E402


class AdminUsersWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()

        self.repository = SecurityRepository()

        self.current_email: str | None = None
        self.current_role_code: str | None = None
        self.current_permission_code: str | None = None
        self.current_service_code: str | None = None

        self.permission_checkboxes: dict[str, QCheckBox] = {}

        self.users_table: QTableWidget | None = None
        self.email_edit: QLineEdit | None = None
        self.display_name_edit: QLineEdit | None = None
        self.role_combo: QComboBox | None = None
        self.service_combo: QComboBox | None = None
        self.active_checkbox: QCheckBox | None = None
        self.user_status_label: QLabel | None = None

        self.roles_table: QTableWidget | None = None
        self.role_code_edit: QLineEdit | None = None
        self.role_label_edit: QLineEdit | None = None
        self.role_status_label: QLabel | None = None
        self.permissions_container_layout: QVBoxLayout | None = None

        self.permissions_table: QTableWidget | None = None
        self.permission_code_edit: QLineEdit | None = None
        self.permission_label_edit: QLineEdit | None = None
        self.permission_status_label: QLabel | None = None

        self.sharepoint_table: QTableWidget | None = None
        self.service_code_edit: QLineEdit | None = None
        self.site_name_edit: QLineEdit | None = None
        self.library_name_edit: QLineEdit | None = None
        self.base_path_edit: QLineEdit | None = None
        self.sharepoint_active_checkbox: QCheckBox | None = None
        self.sharepoint_status_label: QLabel | None = None

        self._build_ui()
        self._bootstrap()

    def _bootstrap(self) -> None:
        try:
            self._load_reference_data()
            self._load_users()
            self._load_roles()
            self._load_permissions()
            self._load_sharepoint_contexts()
        except FileNotFoundError as exc:
            QMessageBox.critical(self, "Base introuvable", str(exc))

    def _build_ui(self) -> None:
        self.setWindowTitle("RaLab Admin | Utilisateurs, rôles, permissions et SharePoint")
        self.resize(1500, 940)

        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        root_layout = QVBoxLayout(central_widget)
        root_layout.setContentsMargins(20, 20, 20, 20)
        root_layout.setSpacing(16)

        title_label = QLabel("Administration sécurité RaLab")
        title_label.setStyleSheet("font-size: 20pt; font-weight: 700;")

        subtitle_label = QLabel(
            "Gestion centralisée des utilisateurs, rôles, permissions et contextes SharePoint. "
            "L'application principale lit ensuite cette configuration depuis security.db."
        )
        subtitle_label.setWordWrap(True)

        self.tabs = QTabWidget()

        self.tabs.addTab(self._build_users_tab(), "Utilisateurs")
        self.tabs.addTab(self._build_roles_tab(), "Rôles & permissions")
        self.tabs.addTab(self._build_permissions_tab(), "Catalogue permissions")
        self.tabs.addTab(self._build_sharepoint_tab(), "SharePoint contexts")

        root_layout.addWidget(title_label)
        root_layout.addWidget(subtitle_label)
        root_layout.addWidget(self.tabs)

    def _build_users_tab(self) -> QWidget:
        tab = QWidget()
        root_layout = QHBoxLayout(tab)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(16)

        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(12)

        left_title = QLabel("Utilisateurs")
        left_title.setStyleSheet("font-size: 16pt; font-weight: 700;")

        self.users_table = QTableWidget()
        self.users_table.setColumnCount(5)
        self.users_table.setHorizontalHeaderLabels(
            ["Email", "Nom", "Rôle", "Service", "Actif"]
        )
        self.users_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.users_table.setSelectionMode(QTableWidget.SingleSelection)
        self.users_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.users_table.horizontalHeader().setStretchLastSection(True)
        self.users_table.verticalHeader().setVisible(False)
        self.users_table.itemSelectionChanged.connect(self._handle_user_selection_changed)

        left_buttons_layout = QHBoxLayout()

        reload_button = QPushButton("Recharger")
        reload_button.clicked.connect(self._load_users)

        new_user_button = QPushButton("Nouveau")
        new_user_button.clicked.connect(self._clear_user_form)

        toggle_active_button = QPushButton("Activer / Désactiver")
        toggle_active_button.clicked.connect(self._toggle_active_user)

        left_buttons_layout.addWidget(reload_button)
        left_buttons_layout.addWidget(new_user_button)
        left_buttons_layout.addWidget(toggle_active_button)

        left_layout.addWidget(left_title)
        left_layout.addWidget(self.users_table)
        left_layout.addLayout(left_buttons_layout)

        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(12)

        right_title = QLabel("Édition utilisateur")
        right_title.setStyleSheet("font-size: 16pt; font-weight: 700;")

        form_widget = QWidget()
        form_layout = QFormLayout(form_widget)
        form_layout.setContentsMargins(0, 0, 0, 0)
        form_layout.setSpacing(12)

        self.email_edit = QLineEdit()
        self.display_name_edit = QLineEdit()
        self.role_combo = QComboBox()
        self.service_combo = QComboBox()
        self.active_checkbox = QCheckBox("Utilisateur actif")
        self.active_checkbox.setChecked(True)

        form_layout.addRow("Email", self.email_edit)
        form_layout.addRow("Nom affiché", self.display_name_edit)
        form_layout.addRow("Rôle", self.role_combo)
        form_layout.addRow("Service", self.service_combo)
        form_layout.addRow("", self.active_checkbox)

        actions_layout = QHBoxLayout()

        save_button = QPushButton("Enregistrer")
        save_button.clicked.connect(self._save_user)

        clear_button = QPushButton("Vider le formulaire")
        clear_button.clicked.connect(self._clear_user_form)

        actions_layout.addWidget(save_button)
        actions_layout.addWidget(clear_button)

        self.user_status_label = QLabel("Prêt.")
        self.user_status_label.setWordWrap(True)

        right_layout.addWidget(right_title)
        right_layout.addWidget(form_widget)
        right_layout.addLayout(actions_layout)
        right_layout.addStretch()
        right_layout.addWidget(self.user_status_label)

        root_layout.addWidget(left_widget, 2)
        root_layout.addWidget(right_widget, 1)

        return tab

    def _build_roles_tab(self) -> QWidget:
        tab = QWidget()
        root_layout = QHBoxLayout(tab)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(16)

        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(12)

        left_title = QLabel("Rôles")
        left_title.setStyleSheet("font-size: 16pt; font-weight: 700;")

        self.roles_table = QTableWidget()
        self.roles_table.setColumnCount(2)
        self.roles_table.setHorizontalHeaderLabels(["Code", "Libellé"])
        self.roles_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.roles_table.setSelectionMode(QTableWidget.SingleSelection)
        self.roles_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.roles_table.horizontalHeader().setStretchLastSection(True)
        self.roles_table.verticalHeader().setVisible(False)
        self.roles_table.itemSelectionChanged.connect(self._handle_role_selection_changed)

        left_buttons_layout = QHBoxLayout()

        reload_roles_button = QPushButton("Recharger")
        reload_roles_button.clicked.connect(self._load_roles)

        new_role_button = QPushButton("Nouveau rôle")
        new_role_button.clicked.connect(self._clear_role_form)

        left_buttons_layout.addWidget(reload_roles_button)
        left_buttons_layout.addWidget(new_role_button)

        left_layout.addWidget(left_title)
        left_layout.addWidget(self.roles_table)
        left_layout.addLayout(left_buttons_layout)

        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(12)

        right_title = QLabel("Édition rôle")
        right_title.setStyleSheet("font-size: 16pt; font-weight: 700;")

        form_widget = QWidget()
        form_layout = QFormLayout(form_widget)
        form_layout.setContentsMargins(0, 0, 0, 0)
        form_layout.setSpacing(12)

        self.role_code_edit = QLineEdit()
        self.role_label_edit = QLineEdit()

        form_layout.addRow("Code rôle", self.role_code_edit)
        form_layout.addRow("Libellé", self.role_label_edit)

        permissions_group = QGroupBox("Permissions du rôle")
        permissions_group_layout = QVBoxLayout(permissions_group)
        permissions_group_layout.setContentsMargins(12, 12, 12, 12)
        permissions_group_layout.setSpacing(8)

        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)

        scroll_content = QWidget()
        self.permissions_container_layout = QVBoxLayout(scroll_content)
        self.permissions_container_layout.setContentsMargins(0, 0, 0, 0)
        self.permissions_container_layout.setSpacing(8)

        scroll_area.setWidget(scroll_content)
        permissions_group_layout.addWidget(scroll_area)

        actions_layout = QHBoxLayout()

        save_role_button = QPushButton("Enregistrer rôle + permissions")
        save_role_button.clicked.connect(self._save_role)

        clear_role_button = QPushButton("Vider le formulaire")
        clear_role_button.clicked.connect(self._clear_role_form)

        actions_layout.addWidget(save_role_button)
        actions_layout.addWidget(clear_role_button)

        self.role_status_label = QLabel("Prêt.")
        self.role_status_label.setWordWrap(True)

        right_layout.addWidget(right_title)
        right_layout.addWidget(form_widget)
        right_layout.addWidget(permissions_group)
        right_layout.addLayout(actions_layout)
        right_layout.addWidget(self.role_status_label)

        root_layout.addWidget(left_widget, 1)
        root_layout.addWidget(right_widget, 2)

        return tab

    def _build_permissions_tab(self) -> QWidget:
        tab = QWidget()
        root_layout = QHBoxLayout(tab)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(16)

        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(12)

        left_title = QLabel("Catalogue permissions")
        left_title.setStyleSheet("font-size: 16pt; font-weight: 700;")

        self.permissions_table = QTableWidget()
        self.permissions_table.setColumnCount(2)
        self.permissions_table.setHorizontalHeaderLabels(["Code", "Libellé"])
        self.permissions_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.permissions_table.setSelectionMode(QTableWidget.SingleSelection)
        self.permissions_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.permissions_table.horizontalHeader().setStretchLastSection(True)
        self.permissions_table.verticalHeader().setVisible(False)
        self.permissions_table.itemSelectionChanged.connect(self._handle_permission_selection_changed)

        left_buttons_layout = QHBoxLayout()

        reload_permissions_button = QPushButton("Recharger")
        reload_permissions_button.clicked.connect(self._load_permissions)

        new_permission_button = QPushButton("Nouvelle permission")
        new_permission_button.clicked.connect(self._clear_permission_form)

        left_buttons_layout.addWidget(reload_permissions_button)
        left_buttons_layout.addWidget(new_permission_button)

        left_layout.addWidget(left_title)
        left_layout.addWidget(self.permissions_table)
        left_layout.addLayout(left_buttons_layout)

        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(12)

        right_title = QLabel("Édition permission")
        right_title.setStyleSheet("font-size: 16pt; font-weight: 700;")

        form_widget = QWidget()
        form_layout = QFormLayout(form_widget)
        form_layout.setContentsMargins(0, 0, 0, 0)
        form_layout.setSpacing(12)

        self.permission_code_edit = QLineEdit()
        self.permission_label_edit = QLineEdit()

        form_layout.addRow("Code permission", self.permission_code_edit)
        form_layout.addRow("Libellé", self.permission_label_edit)

        actions_layout = QHBoxLayout()

        save_permission_button = QPushButton("Enregistrer permission")
        save_permission_button.clicked.connect(self._save_permission)

        clear_permission_button = QPushButton("Vider le formulaire")
        clear_permission_button.clicked.connect(self._clear_permission_form)

        actions_layout.addWidget(save_permission_button)
        actions_layout.addWidget(clear_permission_button)

        self.permission_status_label = QLabel("Prêt.")
        self.permission_status_label.setWordWrap(True)

        right_layout.addWidget(right_title)
        right_layout.addWidget(form_widget)
        right_layout.addLayout(actions_layout)
        right_layout.addStretch()
        right_layout.addWidget(self.permission_status_label)

        root_layout.addWidget(left_widget, 1)
        root_layout.addWidget(right_widget, 1)

        return tab

    def _build_sharepoint_tab(self) -> QWidget:
        tab = QWidget()
        root_layout = QHBoxLayout(tab)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(16)

        left_widget = QWidget()
        left_layout = QVBoxLayout(left_widget)
        left_layout.setContentsMargins(0, 0, 0, 0)
        left_layout.setSpacing(12)

        left_title = QLabel("Contexts SharePoint")
        left_title.setStyleSheet("font-size: 16pt; font-weight: 700;")

        self.sharepoint_table = QTableWidget()
        self.sharepoint_table.setColumnCount(5)
        self.sharepoint_table.setHorizontalHeaderLabels(
            ["Service", "Site", "Bibliothèque", "Base path", "Actif"]
        )
        self.sharepoint_table.setSelectionBehavior(QTableWidget.SelectRows)
        self.sharepoint_table.setSelectionMode(QTableWidget.SingleSelection)
        self.sharepoint_table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.sharepoint_table.horizontalHeader().setStretchLastSection(True)
        self.sharepoint_table.verticalHeader().setVisible(False)
        self.sharepoint_table.itemSelectionChanged.connect(self._handle_sharepoint_selection_changed)

        left_buttons_layout = QHBoxLayout()

        reload_button = QPushButton("Recharger")
        reload_button.clicked.connect(self._load_sharepoint_contexts)

        new_button = QPushButton("Nouveau contexte")
        new_button.clicked.connect(self._clear_sharepoint_form)

        toggle_button = QPushButton("Activer / Désactiver")
        toggle_button.clicked.connect(self._toggle_sharepoint_context_active)

        left_buttons_layout.addWidget(reload_button)
        left_buttons_layout.addWidget(new_button)
        left_buttons_layout.addWidget(toggle_button)

        left_layout.addWidget(left_title)
        left_layout.addWidget(self.sharepoint_table)
        left_layout.addLayout(left_buttons_layout)

        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(12)

        right_title = QLabel("Édition contexte SharePoint")
        right_title.setStyleSheet("font-size: 16pt; font-weight: 700;")

        form_widget = QWidget()
        form_layout = QFormLayout(form_widget)
        form_layout.setContentsMargins(0, 0, 0, 0)
        form_layout.setSpacing(12)

        self.service_code_edit = QLineEdit()
        self.site_name_edit = QLineEdit()
        self.library_name_edit = QLineEdit()
        self.base_path_edit = QLineEdit()
        self.sharepoint_active_checkbox = QCheckBox("Contexte actif")
        self.sharepoint_active_checkbox.setChecked(True)

        form_layout.addRow("Service code", self.service_code_edit)
        form_layout.addRow("Site name", self.site_name_edit)
        form_layout.addRow("Library name", self.library_name_edit)
        form_layout.addRow("Base path", self.base_path_edit)
        form_layout.addRow("", self.sharepoint_active_checkbox)

        actions_layout = QHBoxLayout()

        save_button = QPushButton("Enregistrer contexte")
        save_button.clicked.connect(self._save_sharepoint_context)

        clear_button = QPushButton("Vider le formulaire")
        clear_button.clicked.connect(self._clear_sharepoint_form)

        actions_layout.addWidget(save_button)
        actions_layout.addWidget(clear_button)

        self.sharepoint_status_label = QLabel("Prêt.")
        self.sharepoint_status_label.setWordWrap(True)

        right_layout.addWidget(right_title)
        right_layout.addWidget(form_widget)
        right_layout.addLayout(actions_layout)
        right_layout.addStretch()
        right_layout.addWidget(self.sharepoint_status_label)

        root_layout.addWidget(left_widget, 2)
        root_layout.addWidget(right_widget, 1)

        return tab

    def _load_reference_data(self) -> None:
        self._reload_roles_combo()
        self._reload_service_combo()

    def _reload_roles_combo(self) -> None:
        roles = self.repository.list_roles()
        self.role_combo.clear()

        for row in roles:
            self.role_combo.addItem(f'{row["role_code"]} | {row["label"]}', row["role_code"])

    def _reload_service_combo(self) -> None:
        service_codes = self.repository.list_service_codes()
        self.service_combo.clear()

        for service_code in service_codes:
            self.service_combo.addItem(service_code, service_code)

    def _load_users(self) -> None:
        rows = self.repository.list_all_users()
        self.users_table.setRowCount(len(rows))

        for row_index, row in enumerate(rows):
            values = [
                row["email"],
                row["display_name"],
                row["role_code"],
                row["service_code"],
                "Oui" if int(row["is_active"]) == 1 else "Non",
            ]

            for column_index, value in enumerate(values):
                item = QTableWidgetItem(str(value))
                if column_index == 4:
                    item.setTextAlignment(Qt.AlignCenter)
                self.users_table.setItem(row_index, column_index, item)

        self.users_table.resizeColumnsToContents()
        self.user_status_label.setText(f"{len(rows)} utilisateur(s) chargé(s).")

    def _load_roles(self) -> None:
        rows = self.repository.list_roles()
        self.roles_table.setRowCount(len(rows))

        for row_index, row in enumerate(rows):
            self.roles_table.setItem(row_index, 0, QTableWidgetItem(row["role_code"]))
            self.roles_table.setItem(row_index, 1, QTableWidgetItem(row["label"]))

        self.roles_table.resizeColumnsToContents()
        self._reload_roles_combo()
        self._rebuild_permission_checkboxes()
        self.role_status_label.setText(f"{len(rows)} rôle(s) chargé(s).")

    def _load_permissions(self) -> None:
        rows = self.repository.list_permissions()
        self.permissions_table.setRowCount(len(rows))

        for row_index, row in enumerate(rows):
            self.permissions_table.setItem(row_index, 0, QTableWidgetItem(row["permission_code"]))
            self.permissions_table.setItem(row_index, 1, QTableWidgetItem(row["label"]))

        self.permissions_table.resizeColumnsToContents()
        self._rebuild_permission_checkboxes()
        self.permission_status_label.setText(f"{len(rows)} permission(s) chargée(s).")

    def _load_sharepoint_contexts(self) -> None:
        rows = self.repository.list_sharepoint_contexts()
        self.sharepoint_table.setRowCount(len(rows))

        for row_index, row in enumerate(rows):
            values = [
                row["service_code"],
                row["site_name"],
                row["library_name"],
                row["base_path"],
                "Oui" if int(row["is_active"]) == 1 else "Non",
            ]

            for column_index, value in enumerate(values):
                item = QTableWidgetItem(str(value))
                if column_index == 4:
                    item.setTextAlignment(Qt.AlignCenter)
                self.sharepoint_table.setItem(row_index, column_index, item)

        self.sharepoint_table.resizeColumnsToContents()
        self._reload_service_combo()
        self.sharepoint_status_label.setText(f"{len(rows)} contexte(s) SharePoint chargé(s).")

    def _rebuild_permission_checkboxes(self) -> None:
        if self.permissions_container_layout is None:
            return

        while self.permissions_container_layout.count():
            item = self.permissions_container_layout.takeAt(0)
            widget = item.widget()
            if widget is not None:
                widget.deleteLater()

        self.permission_checkboxes.clear()

        permission_rows = self.repository.list_permissions()
        for row in permission_rows:
            checkbox = QCheckBox(f'{row["permission_code"]} | {row["label"]}')
            self.permission_checkboxes[row["permission_code"]] = checkbox
            self.permissions_container_layout.addWidget(checkbox)

        self.permissions_container_layout.addStretch()

    def _handle_user_selection_changed(self) -> None:
        selected_items = self.users_table.selectedItems()
        if not selected_items:
            return

        row_index = selected_items[0].row()

        email = self.users_table.item(row_index, 0).text()
        display_name = self.users_table.item(row_index, 1).text()
        role_code = self.users_table.item(row_index, 2).text()
        service_code = self.users_table.item(row_index, 3).text()
        is_active = self.users_table.item(row_index, 4).text() == "Oui"

        self.current_email = email
        self.email_edit.setText(email)
        self.display_name_edit.setText(display_name)
        self._set_combo_value(self.role_combo, role_code)
        self._set_combo_value(self.service_combo, service_code)
        self.active_checkbox.setChecked(is_active)

        self.user_status_label.setText(f"Utilisateur sélectionné : {email}")

    def _handle_role_selection_changed(self) -> None:
        selected_items = self.roles_table.selectedItems()
        if not selected_items:
            return

        row_index = selected_items[0].row()
        role_code = self.roles_table.item(row_index, 0).text()
        role_label = self.roles_table.item(row_index, 1).text()

        self.current_role_code = role_code
        self.role_code_edit.setText(role_code)
        self.role_label_edit.setText(role_label)

        selected_permissions = set(self.repository.get_permissions_for_role(role_code))
        for permission_code, checkbox in self.permission_checkboxes.items():
            checkbox.setChecked(permission_code in selected_permissions)

        self.role_status_label.setText(f"Rôle sélectionné : {role_code}")

    def _handle_permission_selection_changed(self) -> None:
        selected_items = self.permissions_table.selectedItems()
        if not selected_items:
            return

        row_index = selected_items[0].row()
        permission_code = self.permissions_table.item(row_index, 0).text()
        permission_label = self.permissions_table.item(row_index, 1).text()

        self.current_permission_code = permission_code
        self.permission_code_edit.setText(permission_code)
        self.permission_label_edit.setText(permission_label)

        self.permission_status_label.setText(f"Permission sélectionnée : {permission_code}")

    def _handle_sharepoint_selection_changed(self) -> None:
        selected_items = self.sharepoint_table.selectedItems()
        if not selected_items:
            return

        row_index = selected_items[0].row()

        service_code = self.sharepoint_table.item(row_index, 0).text()
        site_name = self.sharepoint_table.item(row_index, 1).text()
        library_name = self.sharepoint_table.item(row_index, 2).text()
        base_path = self.sharepoint_table.item(row_index, 3).text()
        is_active = self.sharepoint_table.item(row_index, 4).text() == "Oui"

        self.current_service_code = service_code
        self.service_code_edit.setText(service_code)
        self.site_name_edit.setText(site_name)
        self.library_name_edit.setText(library_name)
        self.base_path_edit.setText(base_path)
        self.sharepoint_active_checkbox.setChecked(is_active)

        self.sharepoint_status_label.setText(f"Contexte SharePoint sélectionné : {service_code}")

    def _save_user(self) -> None:
        email = self.email_edit.text().strip().lower()
        display_name = self.display_name_edit.text().strip()
        role_code = self.role_combo.currentData()
        service_code = self.service_combo.currentData()
        is_active = self.active_checkbox.isChecked()

        if not email:
            self._show_warning("Merci de renseigner un email.")
            return

        if not display_name:
            self._show_warning("Merci de renseigner un nom affiché.")
            return

        if not role_code:
            self._show_warning("Merci de choisir un rôle.")
            return

        if not service_code:
            self._show_warning("Merci de choisir un service.")
            return

        try:
            self.repository.upsert_user(
                email=email,
                display_name=display_name,
                role_code=role_code,
                service_code=service_code,
                is_active=is_active,
            )
        except Exception as exc:
            QMessageBox.critical(self, "Erreur", str(exc))
            return

        self.current_email = email
        self.user_status_label.setText(f"Utilisateur enregistré : {email}")
        self._load_users()
        self._select_user_in_table(email)

    def _toggle_active_user(self) -> None:
        email = self.email_edit.text().strip().lower()
        if not email:
            self._show_warning("Sélectionne d'abord un utilisateur.")
            return

        current_value = self.active_checkbox.isChecked()
        new_value = not current_value

        try:
            self.repository.set_user_active(email=email, is_active=new_value)
        except Exception as exc:
            QMessageBox.critical(self, "Erreur", str(exc))
            return

        self.active_checkbox.setChecked(new_value)
        self.user_status_label.setText(
            f"Utilisateur {'activé' if new_value else 'désactivé'} : {email}"
        )
        self._load_users()
        self._select_user_in_table(email)

    def _save_role(self) -> None:
        role_code = self.role_code_edit.text().strip()
        role_label = self.role_label_edit.text().strip()

        if not role_code:
            self._show_warning("Merci de renseigner un code rôle.")
            return

        if not role_label:
            self._show_warning("Merci de renseigner un libellé.")
            return

        selected_permission_codes = [
            permission_code
            for permission_code, checkbox in self.permission_checkboxes.items()
            if checkbox.isChecked()
        ]

        try:
            self.repository.upsert_role(role_code=role_code, label=role_label)
            self.repository.replace_role_permissions(
                role_code=role_code,
                permission_codes=selected_permission_codes,
            )
        except Exception as exc:
            QMessageBox.critical(self, "Erreur", str(exc))
            return

        self.current_role_code = role_code
        self.role_status_label.setText(
            f"Rôle enregistré : {role_code} | {len(selected_permission_codes)} permission(s)"
        )
        self._load_roles()
        self._load_users()
        self._select_role_in_table(role_code)

    def _save_permission(self) -> None:
        permission_code = self.permission_code_edit.text().strip()
        permission_label = self.permission_label_edit.text().strip()

        if not permission_code:
            self._show_warning("Merci de renseigner un code permission.")
            return

        if not permission_label:
            self._show_warning("Merci de renseigner un libellé.")
            return

        try:
            self.repository.upsert_permission(
                permission_code=permission_code,
                label=permission_label,
            )
        except Exception as exc:
            QMessageBox.critical(self, "Erreur", str(exc))
            return

        self.current_permission_code = permission_code
        self.permission_status_label.setText(f"Permission enregistrée : {permission_code}")
        self._load_permissions()
        self._load_roles()
        self._select_permission_in_table(permission_code)

    def _save_sharepoint_context(self) -> None:
        service_code = self.service_code_edit.text().strip()
        site_name = self.site_name_edit.text().strip()
        library_name = self.library_name_edit.text().strip()
        base_path = self.base_path_edit.text().strip()
        is_active = self.sharepoint_active_checkbox.isChecked()

        if not service_code:
            self._show_warning("Merci de renseigner un service code.")
            return

        if not site_name:
            self._show_warning("Merci de renseigner un site name.")
            return

        if not library_name:
            self._show_warning("Merci de renseigner un library name.")
            return

        if not base_path:
            self._show_warning("Merci de renseigner un base path.")
            return

        try:
            self.repository.upsert_sharepoint_context(
                service_code=service_code,
                site_name=site_name,
                library_name=library_name,
                base_path=base_path,
                is_active=is_active,
            )
        except Exception as exc:
            QMessageBox.critical(self, "Erreur", str(exc))
            return

        self.current_service_code = service_code
        self.sharepoint_status_label.setText(f"Contexte SharePoint enregistré : {service_code}")
        self._load_sharepoint_contexts()
        self._load_users()
        self._select_sharepoint_in_table(service_code)

    def _toggle_sharepoint_context_active(self) -> None:
        service_code = self.service_code_edit.text().strip()
        if not service_code:
            self._show_warning("Sélectionne d'abord un contexte SharePoint.")
            return

        current_value = self.sharepoint_active_checkbox.isChecked()
        new_value = not current_value

        try:
            self.repository.set_sharepoint_context_active(
                service_code=service_code,
                is_active=new_value,
            )
        except Exception as exc:
            QMessageBox.critical(self, "Erreur", str(exc))
            return

        self.sharepoint_active_checkbox.setChecked(new_value)
        self.sharepoint_status_label.setText(
            f"Contexte SharePoint {'activé' if new_value else 'désactivé'} : {service_code}"
        )
        self._load_sharepoint_contexts()
        self._load_users()
        self._select_sharepoint_in_table(service_code)

    def _clear_user_form(self) -> None:
        self.current_email = None
        self.email_edit.clear()
        self.display_name_edit.clear()

        if self.role_combo.count() > 0:
            self.role_combo.setCurrentIndex(0)

        if self.service_combo.count() > 0:
            self.service_combo.setCurrentIndex(0)

        self.active_checkbox.setChecked(True)
        self.users_table.clearSelection()
        self.user_status_label.setText("Formulaire utilisateur réinitialisé.")

    def _clear_role_form(self) -> None:
        self.current_role_code = None
        self.role_code_edit.clear()
        self.role_label_edit.clear()
        self.roles_table.clearSelection()

        for checkbox in self.permission_checkboxes.values():
            checkbox.setChecked(False)

        self.role_status_label.setText("Formulaire rôle réinitialisé.")

    def _clear_permission_form(self) -> None:
        self.current_permission_code = None
        self.permission_code_edit.clear()
        self.permission_label_edit.clear()
        self.permissions_table.clearSelection()
        self.permission_status_label.setText("Formulaire permission réinitialisé.")

    def _clear_sharepoint_form(self) -> None:
        self.current_service_code = None
        self.service_code_edit.clear()
        self.site_name_edit.clear()
        self.library_name_edit.clear()
        self.base_path_edit.clear()
        self.sharepoint_active_checkbox.setChecked(True)
        self.sharepoint_table.clearSelection()
        self.sharepoint_status_label.setText("Formulaire SharePoint réinitialisé.")

    def _select_user_in_table(self, email: str) -> None:
        for row_index in range(self.users_table.rowCount()):
            if self.users_table.item(row_index, 0).text().lower() == email.lower():
                self.users_table.selectRow(row_index)
                return

    def _select_role_in_table(self, role_code: str) -> None:
        for row_index in range(self.roles_table.rowCount()):
            if self.roles_table.item(row_index, 0).text() == role_code:
                self.roles_table.selectRow(row_index)
                return

    def _select_permission_in_table(self, permission_code: str) -> None:
        for row_index in range(self.permissions_table.rowCount()):
            if self.permissions_table.item(row_index, 0).text() == permission_code:
                self.permissions_table.selectRow(row_index)
                return

    def _select_sharepoint_in_table(self, service_code: str) -> None:
        for row_index in range(self.sharepoint_table.rowCount()):
            if self.sharepoint_table.item(row_index, 0).text() == service_code:
                self.sharepoint_table.selectRow(row_index)
                return

    def _set_combo_value(self, combo_box: QComboBox, value: str) -> None:
        for index in range(combo_box.count()):
            if combo_box.itemData(index) == value:
                combo_box.setCurrentIndex(index)
                return

    def _show_warning(self, message: str) -> None:
        QMessageBox.warning(self, "Attention", message)


def main() -> int:
    app = QApplication(sys.argv)
    window = AdminUsersWindow()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())