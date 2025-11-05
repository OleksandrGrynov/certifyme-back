import prisma from "../config/prisma.js";

const UserModel = {
    /**
     * 🔹 Отримати користувача за ID
     */
    async getById(id) {
        const user = await prisma.user.findUnique({
            where: { id: Number(id) },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });
        return user;
    },

    /**
     * 🔹 Оновити профіль користувача
     */
    async updateProfile(id, first_name, last_name, email) {
        const updated = await prisma.user.update({
            where: { id: Number(id) },
            data: {
                firstName: first_name,
                lastName: last_name,
                email,
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                createdAt: true,
            },
        });
        return updated;
    },

    /**
     * 🔹 Оновити пароль
     */
    async updatePassword(id, newPassword) {
        await prisma.user.update({
            where: { id: Number(id) },
            data: { password: newPassword },
        });
    },
};

export default UserModel;
