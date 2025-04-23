using System.Collections.Generic;
using System.Threading.Tasks;
using MongoDB.Driver;
using Fabrik3D_Lite.Models;

namespace Fabrik3D_Lite.Data
{
    public class Repository<T> where T : class
    {
        private readonly IMongoCollection<T> _collection;

        public Repository(MongoDBContext context, string collectionName)
        {
            _collection = context.Database.GetCollection<T>(collectionName);
        }

        public async Task<List<T>> GetAllAsync()
        {
            return await _collection.Find(_ => true).ToListAsync();
        }

        public async Task<T> GetByIdAsync(string id)
        {
            return await _collection.Find(item => item.Id == id).FirstOrDefaultAsync();
        }

        public async Task CreateAsync(T item)
        {
            await _collection.InsertOneAsync(item);
        }

        public async Task UpdateAsync(string id, T item)
        {
            await _collection.ReplaceOneAsync(existingItem => existingItem.Id == id, item);
        }

        public async Task DeleteAsync(string id)
        {
            await _collection.DeleteOneAsync(item => item.Id == id);
        }
    }
}