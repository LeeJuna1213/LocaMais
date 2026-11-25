import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module.js';
import { Carro } from '../carro/entities/carro.entity.js';
import { CategoriaVeiculo } from '../carro/entities/categoria-veiculo.entity.js';
import { StatusVeiculo } from '../carro/enums/status-veiculo.enum.js';

type DemoVehicle = {
  placa: string;
  marca: string;
  modelo: string;
  categoria: string;
  ano: number;
  valorDiaria: number;
  cambio: 'Automático' | 'Manual';
  lugares: number;
  proximaVistoriaKm: number;
  descricao: string;
};

const demoVehicles: DemoVehicle[] = [
  { placa: 'LMA1A01', marca: 'Fiat', modelo: 'Mobi Like', categoria: 'Econômico', ano: 2023, valorDiaria: 109.9, cambio: 'Manual', lugares: 5, proximaVistoriaKm: 25000, descricao: 'Compacto e econômico, ideal para deslocamentos urbanos, estacionamentos apertados e viagens curtas com baixo consumo.' },
  { placa: 'LMA1A02', marca: 'Renault', modelo: 'Kwid Zen', categoria: 'Econômico', ano: 2024, valorDiaria: 119.9, cambio: 'Manual', lugares: 5, proximaVistoriaKm: 18000, descricao: 'Leve e prático para a rotina na cidade, oferece boa altura em relação ao solo e facilidade para manobrar.' },
  { placa: 'LMA1A03', marca: 'Chevrolet', modelo: 'Onix LT', categoria: 'Hatch', ano: 2023, valorDiaria: 149.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 32000, descricao: 'Hatch confortável com conectividade e condução equilibrada, adequado para trajetos diários e escapadas de fim de semana.' },
  { placa: 'LMA1A04', marca: 'Hyundai', modelo: 'HB20 Comfort', categoria: 'Hatch', ano: 2024, valorDiaria: 159.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 15000, descricao: 'Interior bem equipado e direção suave para aproveitar a cidade com conforto, inclusive em percursos mais longos.' },
  { placa: 'LMA1A05', marca: 'Volkswagen', modelo: 'Polo Track', categoria: 'Hatch', ano: 2023, valorDiaria: 159.9, cambio: 'Manual', lugares: 5, proximaVistoriaKm: 38000, descricao: 'Hatch versátil e estável, combina espaço para cinco ocupantes com praticidade para compromissos urbanos e rodoviários.' },
  { placa: 'LMA1A06', marca: 'Fiat', modelo: 'Argo Drive', categoria: 'Hatch', ano: 2024, valorDiaria: 169.9, cambio: 'Manual', lugares: 5, proximaVistoriaKm: 22000, descricao: 'Boa posição de dirigir e cabine funcional para o dia a dia, com porta-malas adequado para pequenas viagens.' },
  { placa: 'LMA1A07', marca: 'Toyota', modelo: 'Corolla GLi', categoria: 'Sedan', ano: 2023, valorDiaria: 219.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 52000, descricao: 'Sedan confortável e silencioso, com amplo espaço para passageiros e bagagens em viagens de negócios ou lazer.' },
  { placa: 'LMA1A08', marca: 'Chevrolet', modelo: 'Onix Plus LT', categoria: 'Sedan', ano: 2024, valorDiaria: 189.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 20000, descricao: 'Porta-malas generoso e cabine confortável fazem deste sedan uma escolha prática para famílias e deslocamentos intermunicipais.' },
  { placa: 'LMA1A09', marca: 'Honda', modelo: 'City Sedan EX', categoria: 'Sedan', ano: 2023, valorDiaria: 229.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 47000, descricao: 'Espaço interno bem aproveitado, acabamento cuidadoso e condução eficiente para viagens tranquilas com a família.' },
  { placa: 'LMA1A10', marca: 'Volkswagen', modelo: 'Virtus Comfortline', categoria: 'Sedan', ano: 2024, valorDiaria: 239.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 17000, descricao: 'Sedan espaçoso com bom desempenho rodoviário e porta-malas amplo, indicado para viagens e compromissos profissionais.' },
  { placa: 'LMA1A11', marca: 'Jeep', modelo: 'Renegade Sport', categoria: 'SUV', ano: 2023, valorDiaria: 249.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 59000, descricao: 'SUV de posição elevada e cabine confortável, pronto para passeios urbanos, viagens e percursos com pavimento irregular.' },
  { placa: 'LMA1A12', marca: 'Hyundai', modelo: 'Creta Comfort', categoria: 'SUV', ano: 2024, valorDiaria: 269.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 19000, descricao: 'Espaço generoso para passageiros, acesso fácil à cabine e comodidades que tornam os trajetos em família mais agradáveis.' },
  { placa: 'LMA1A13', marca: 'Chevrolet', modelo: 'Tracker LT', categoria: 'SUV', ano: 2023, valorDiaria: 279.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 61000, descricao: 'SUV compacto com conectividade e condução ágil, equilibrando conforto na cidade com confiança na estrada.' },
  { placa: 'LMA1A14', marca: 'Nissan', modelo: 'Kicks Sense', categoria: 'SUV', ano: 2024, valorDiaria: 259.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 16000, descricao: 'Leve de conduzir e confortável, oferece boa visibilidade e espaço para bagagens em passeios e viagens curtas.' },
  { placa: 'LMA1A15', marca: 'Volkswagen', modelo: 'T-Cross Comfortline', categoria: 'SUV', ano: 2024, valorDiaria: 289.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 14000, descricao: 'SUV versátil com cabine modulável e tecnologia de conveniência, ideal para combinar rotina urbana e viagens em família.' },
  { placa: 'LMA1A16', marca: 'Toyota', modelo: 'Hilux SRV', categoria: 'Picape', ano: 2023, valorDiaria: 399.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 78000, descricao: 'Picape robusta com cabine dupla e capacidade para encarar trabalho, estrada e lazer com conforto para os ocupantes.' },
  { placa: 'LMA1A17', marca: 'Fiat', modelo: 'Strada Freedom', categoria: 'Picape', ano: 2024, valorDiaria: 229.9, cambio: 'Manual', lugares: 5, proximaVistoriaKm: 23000, descricao: 'Picape compacta e prática para transportar equipamentos e materiais sem abrir mão da agilidade nos deslocamentos diários.' },
  { placa: 'LMA1A18', marca: 'Chevrolet', modelo: 'Spin LT', categoria: 'Minivan', ano: 2023, valorDiaria: 249.9, cambio: 'Automático', lugares: 7, proximaVistoriaKm: 65000, descricao: 'Minivan com configuração para até sete ocupantes e interior flexível, indicada para famílias, grupos e bagagens volumosas.' },
  { placa: 'LMA1A19', marca: 'Chevrolet', modelo: 'S10 LTZ', categoria: 'Picape', ano: 2024, valorDiaria: 429.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 12000, descricao: 'Picape de cabine dupla com amplo espaço e proposta robusta, adequada para viagens, atividades profissionais e lazer.' },
  { placa: 'LMA1A20', marca: 'Jeep', modelo: 'Compass Longitude', categoria: 'SUV', ano: 2024, valorDiaria: 329.9, cambio: 'Automático', lugares: 5, proximaVistoriaKm: 21000, descricao: 'SUV médio com acabamento confortável, bom espaço para passageiros e recursos para viagens rodoviárias mais agradáveis.' },
];

async function seedDemoVehicles(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dataSource = app.get(DataSource);
  try {
    await dataSource.transaction(async (manager) => {
      const categories = manager.getRepository(CategoriaVeiculo);
      const cars = manager.getRepository(Carro);
      const categoryByName = new Map<string, CategoriaVeiculo>();

      for (const name of new Set(demoVehicles.map((vehicle) => vehicle.categoria))) {
        let category = await categories.findOne({ where: { nome_normalizado: name.normalize('NFC').trim().toLocaleLowerCase('pt-BR') } });
        if (!category) {
          const nome_normalizado = name.normalize('NFC').trim().toLocaleLowerCase('pt-BR');
          category = await categories.save(categories.create({ nome: name, nome_normalizado }));
        }
        categoryByName.set(name, category);
      }

      let inserted = 0;
      let skipped = 0;
      for (const vehicle of demoVehicles) {
        if (await cars.exists({ where: { placa: vehicle.placa } })) {
          skipped++;
          continue;
        }
        const category = categoryByName.get(vehicle.categoria)!;
        await cars.save(cars.create({
          ...vehicle,
          categoria_id: category.id,
          categoriaEntity: category,
          status: StatusVeiculo.DISPONIVEL,
          quilometragem: 0,
          foto: null,
        }));
        inserted++;
      }
      console.log(`Seed de veículos concluído: ${inserted} inseridos, ${skipped} já existentes ignorados.`);
    });

    const savedVehicles = await dataSource.getRepository(Carro).find({
      where: demoVehicles.map(({ placa }) => ({ placa })),
      relations: { categoriaEntity: true },
    });
    const byPlate = new Map(savedVehicles.map((vehicle) => [vehicle.placa, vehicle]));
    const invalidVehicles = demoVehicles.filter((expected) => {
      const actual = byPlate.get(expected.placa);
      return !actual
        || actual.marca !== expected.marca
        || actual.modelo !== expected.modelo
        || actual.categoriaEntity?.nome !== expected.categoria
        || actual.ano !== expected.ano
        || Number(actual.valorDiaria) !== expected.valorDiaria
        || actual.cambio !== expected.cambio
        || actual.lugares !== expected.lugares
        || actual.proximaVistoriaKm !== expected.proximaVistoriaKm
        || actual.proximaVistoriaKm < 5000
        || actual.proximaVistoriaKm > 90000
        || actual.foto !== null
        || actual.status !== StatusVeiculo.DISPONIVEL;
    });
    if (savedVehicles.length !== demoVehicles.length
      || byPlate.size !== demoVehicles.length
      || invalidVehicles.length > 0) {
      throw new Error(`Validação falhou para as placas: ${invalidVehicles.map(({ placa }) => placa).join(', ') || 'duplicidade ou quantidade incorreta'}`);
    }
    console.log(`Validação concluída: ${savedVehicles.length} veículos, placas únicas, dados conferidos e fotos nulas.`);
  } finally {
    await app.close();
  }
}

seedDemoVehicles().catch((error: unknown) => {
  console.error('Falha no seed de veículos de demonstração:', error);
  process.exitCode = 1;
});
