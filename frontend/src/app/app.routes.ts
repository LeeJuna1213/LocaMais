import { Routes } from '@angular/router';
import { authGuard, roleGuard, staffGuard } from './core/guards/role.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () => import('./pages/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'cadastro',
    loadComponent: () => import('./pages/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'recuperar-senha',
    loadComponent: () => import('./pages/auth/forgot-password.page').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'redefinir-senha',
    loadComponent: () => import('./pages/auth/reset-password.page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'client',
    canActivate: [roleGuard('client')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'veiculos' },
      {
        path: 'veiculos',
        loadComponent: () => import('./pages/client/vehicle-list.page').then((m) => m.VehicleListPage),
      },
      {
        path: 'minhas',
        loadComponent: () => import('./pages/client/my-reservations.page').then((m) => m.MyReservationsPage),
      },
      {
        path: 'pagamentos',
        loadComponent: () => import('./pages/client/customer-payments.page').then((m) => m.CustomerPaymentsPage),
      },
      { path: 'favoritos', loadComponent: () => import('./pages/client/favorites.page').then((m) => m.FavoritesPage) },
      {
        path: 'reservas/:id',
        loadComponent: () => import('./pages/client/reservation-details.page').then((m) => m.ReservationDetailsPage),
      },
      {
        path: 'perfil',
        loadComponent: () => import('./pages/client/profile.page').then((m) => m.ProfilePage),
      },
      {
        path: 'perfil/:section',
        loadComponent: () => import('./pages/client/profile-section.page').then((m) => m.ProfileSectionPage),
      },
    ],
  },
  {
    path: 'admin',
    canActivate: [staffGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },
      {
        path: 'painel',
        loadComponent: () => import('./pages/admin/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'clientes',
        loadComponent: () => import('./pages/admin/clients.page').then((m) => m.ClientsPage),
      },
      {
        path: 'clientes/:id',
        loadComponent: () => import('./pages/admin/client-edit.page').then((m) => m.ClientEditPage),
      },
      {
        path: 'veiculos',
        loadComponent: () => import('./pages/admin/admin-vehicles.page').then((m) => m.AdminVehiclesPage),
      },
      {
        path: 'veiculos/novo',
        loadComponent: () => import('./pages/admin/new-vehicle.page').then((m) => m.NewVehiclePage),
      },
      {
        path: 'veiculos/:id/editar',
        loadComponent: () => import('./pages/admin/new-vehicle.page').then((m) => m.NewVehiclePage),
      },
      {
        path: 'veiculos/:id/revisoes',
        loadComponent: () => import('./pages/admin/vehicle-revisions.page').then((m) => m.VehicleRevisionsPage),
      },
      {
        path: 'veiculos/:id/vistorias',
        loadComponent: () => import('./pages/admin/vehicle-inspections.page').then((m) => m.VehicleInspectionsPage),
      },
      {
        path: 'reservas',
        loadComponent: () => import('./pages/admin/admin-reservations.page').then((m) => m.AdminReservationsPage),
      },
      {
        path: 'reservas/:id',
        loadComponent: () => import('./pages/client/reservation-details.page').then((m) => m.ReservationDetailsPage),
      },
      {
        path: 'locacoes',
        loadComponent: () => import('./pages/admin/pickup-list.page').then((m) => m.PickupListPage),
      },
      {
        path: 'devolucoes',
        loadComponent: () => import('./pages/admin/return-list.page').then((m) => m.ReturnListPage),
      },
      {
        path: 'retirada/:id',
        loadComponent: () => import('./pages/admin/register-pickup.page').then((m) => m.RegisterPickupPage),
      },
      {
        path: 'devolucao/:id',
        loadComponent: () => import('./pages/admin/register-return.page').then((m) => m.RegisterReturnPage),
      },
      {
        path: 'pagamentos',
        loadComponent: () => import('./pages/admin/admin-payments.page').then((m) => m.AdminPaymentsPage),
      },
      {
        path: 'relatorios',
        loadComponent: () => import('./pages/admin/reports.page').then((m) => m.ReportsPage),
      },
      {
        path: 'menu',
        loadComponent: () => import('./pages/admin/admin-menu.page').then((m) => m.AdminMenuPage),
      },
      {
        path: 'reserva',
        loadComponent: () => import('./pages/client/vehicle-list.page').then((m) => m.VehicleListPage),
      },
      {
        path: 'usuarios',
        loadComponent: () => import('./pages/admin/usuarios.page').then((m) => m.UsuariosPage),
        canActivate: [roleGuard('admin')],
      },
      {
        path: 'lojas',
        loadComponent: () => import('./pages/admin/shops.page').then((m) => m.ShopsPage),
        canActivate: [roleGuard('admin')],
      },
      { path: 'lojas/novo', loadComponent: () => import('./pages/admin/shop-edit.page').then((m) => m.ShopEditPage), canActivate: [roleGuard('admin')] },
      { path: 'lojas/:id', loadComponent: () => import('./pages/admin/shop-edit.page').then((m) => m.ShopEditPage), canActivate: [roleGuard('admin')] },
      {
        path: 'taxa-servico',
        loadComponent: () => import('./pages/admin/service-fee.page').then((m) => m.ServiceFeePage),
      },
      {
        path: 'usuarios/novo',
        loadComponent: () => import('./pages/admin/usuario-edit.page').then((m) => m.UsuarioEditPage),
        canActivate: [roleGuard('admin')],
      },
      {
        path: 'usuarios/:id',
        loadComponent: () => import('./pages/admin/usuario-edit.page').then((m) => m.UsuarioEditPage),
        canActivate: [roleGuard('admin')],
      },
    ],
  },
  {
    path: 'booking',
    canActivate: [authGuard],
    children: [
      {
        path: 'vehicle/:id',
        loadComponent: () => import('./pages/booking/vehicle-details.page').then((m) => m.VehicleDetailsPage),
      },
      {
        path: 'reservar/:id',
        loadComponent: () => import('./pages/booking/reservation-form.page').then((m) => m.ReservationFormPage),
      },
      {
        path: 'confirmar',
        loadComponent: () => import('./pages/booking/confirm-reservation.page').then((m) => m.ConfirmReservationPage),
      },
      {
        path: 'pagamento',
        loadComponent: () => import('./pages/booking/payment.page').then((m) => m.PaymentPage),
      },
      {
        path: 'sucesso',
        loadComponent: () => import('./pages/booking/reservation-success.page').then((m) => m.ReservationSuccessPage),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
