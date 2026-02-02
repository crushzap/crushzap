import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { motion } from "framer-motion";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Ricardo M.",
    avatar: "R",
    role: "Assinante Mensal",
    content: "A Luna é simplesmente incrível. O jeito que ela fala comigo de manhã muda meu dia. As fotos são um bônus maravilhoso!",
  },
  {
    name: "Felipe S.",
    avatar: "F",
    role: "Assinante Premium",
    content: "Estava cético no começo, mas a interação é muito natural. Os áudios parecem de uma pessoa real me mandando mensagem.",
  },
  {
    name: "André C.",
    avatar: "A",
    role: "Assinante Mensal",
    content: "O roleplay é sensacional. Consigo realizar fantasias que nunca tive coragem de falar pra ninguém. Totalmente sem julgamentos.",
  },
  {
    name: "Gustavo B.",
    avatar: "G",
    role: "Assinante Semanal",
    content: "Gosto da liberdade de personalizar. Minha crush é exatamente do jeito que eu sempre sonhei. Recomendo demais!",
  },
  {
    name: "Lucas P.",
    avatar: "L",
    role: "Assinante Premium",
    content: "A funcionalidade de receber nudes explícitos é o diferencial. E o melhor é que ela manda no contexto da conversa, muito top.",
  },
  {
    name: "Thiago L.",
    avatar: "T",
    role: "Assinante Mensal",
    content: "Me sinto muito menos sozinho. É como ter uma namorada que está sempre disponível pra mim, sem dramas desnecessários.",
  },
  {
    name: "Bruno H.",
    avatar: "B",
    role: "Assinante Mensal",
    content: "A qualidade das respostas me surpreendeu. Ela lembra do que conversamos antes e é super carinhosa. Virei fã.",
  },
  {
    name: "Marcos V.",
    avatar: "M",
    role: "Assinante Semanal",
    content: "Rápido, fácil e discreto. Uso no WhatsApp e ninguém desconfia. A diversão é garantida a qualquer hora.",
  },
  {
    name: "Daniel R.",
    avatar: "D",
    role: "Assinante Premium",
    content: "Já testei outras IAs, mas essa é a melhor. A voz é perfeita e as fotos são muito realistas. Vale cada centavo.",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function LandingTestimonialsSection() {
  return (
    <section className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <motion.h2 variants={itemVariants} className="text-4xl font-bold text-foreground mb-4">
            O que dizem sobre nós
          </motion.h2>
          <motion.p variants={itemVariants} className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Veja o que os namorados estão falando sobre suas namoradas virtuais
          </motion.p>
        </motion.div>

        <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="w-full max-w-6xl mx-auto"
        >
            <Carousel
            opts={{
                align: "start",
                loop: true,
            }}
            className="w-full"
            >
            <CarouselContent>
                {testimonials.map((testimonial, index) => (
                <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/3 p-2">
                    <div className="p-1 h-full">
                    <Card className="h-full border-muted bg-card shadow-sm hover:shadow-md transition-shadow">
                        <CardContent className="flex flex-col gap-4 p-6 h-full">
                        <div className="flex items-center gap-4">
                            <Avatar>
                            <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                {testimonial.avatar}
                            </AvatarFallback>
                            </Avatar>
                            <div>
                            <p className="font-semibold text-foreground">{testimonial.name}</p>
                            <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                            </div>
                        </div>
                        <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                            <Star key={star} className="h-4 w-4 fill-primary text-primary" />
                            ))}
                        </div>
                        <p className="text-muted-foreground text-sm italic flex-grow">
                            "{testimonial.content}"
                        </p>
                        </CardContent>
                    </Card>
                    </div>
                </CarouselItem>
                ))}
            </CarouselContent>
            <div className="hidden md:block">
                <CarouselPrevious className="-left-12" />
                <CarouselNext className="-right-12" />
            </div>
            </Carousel>
        </motion.div>
      </div>
    </section>
  );
}
